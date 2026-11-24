// TypeScript 独立语言课程 T0 至 T5 手写教案
// name 必须与 language-catalogs.ts 中的 detailedStage 和 programs.ts 中的模板拼接完全一致。
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';
import type { LearningV2LessonExample } from '../../../v2-types.js';

const track = 'P14 · 独立语言课程' as const;
const tsName = (stage: string, topic: string) => `TypeScript · ${stage}：${topic}`;

const TS_DOCS = 'TypeScript Documentation. https://www.typescriptlang.org/docs/';
const TS_HANDBOOK = 'TypeScript Handbook. https://www.typescriptlang.org/docs/handbook/intro.html';
const TS_CONFIG = 'TypeScript Compiler Options. https://www.typescriptlang.org/tsconfig/';
const TS_NARROWING = 'TypeScript Handbook: Narrowing. https://www.typescriptlang.org/docs/handbook/2/narrowing.html';
const TS_GENERICS = 'TypeScript Handbook: Generics. https://www.typescriptlang.org/docs/handbook/2/generics.html';
const TS_MAPPED = 'TypeScript Handbook: Mapped Types. https://www.typescriptlang.org/docs/handbook/2/mapped-types.html';
const TS_CONDITIONAL = 'TypeScript Handbook: Conditional Types. https://www.typescriptlang.org/docs/handbook/2/conditional-types.html';
const TS_DECLARATION = 'TypeScript: Creating .d.ts Files. https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html';
const TS_MODULES = 'TypeScript: Modules Reference. https://www.typescriptlang.org/docs/handbook/modules/reference.html';
const TS_REPO = 'microsoft/TypeScript Compiler. https://github.com/microsoft/TypeScript/tree/main/src/compiler';
const NODE_PACKAGES = 'Node.js Packages and exports. https://nodejs.org/api/packages.html';
const ECMA = 'ECMAScript Language Specification. https://tc39.es/ecma262/';
const MDN = 'MDN JavaScript Reference. https://developer.mozilla.org/en-US/docs/Web/JavaScript';
const OPENAPI = 'OpenAPI Specification 3.1. https://spec.openapis.org/oas/v3.1.0.html';
const ZOD = 'Zod Documentation. https://zod.dev/';
const EXPECT_TYPE = 'expect-type Documentation. https://github.com/mmkal/expect-type';
const API_EXTRACTOR = 'API Extractor Documentation. https://api-extractor.com/';

const t0Stage = '编译器、配置与第一个类型化项目';

const TYPESCRIPT_T0_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: tsName(t0Stage, 'TypeScript 编译器与 JavaScript 运行时'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能运行 Node.js 命令，知道 TypeScript 文件通常需要先编译或由构建工具转译。',
    goal: '能按解析、绑定、检查、生成四阶段解释 tsc 的工作流程，区分编译期类型错误与 JavaScript 运行时错误，并用退出码和产物证明检查确实发生。',
    guidedPractice: '在空目录创建 src/main.ts，写入 const count: number = "3"，先运行 npx tsc --noEmit --pretty false 记录 TS2322 与退出码，再把字符串改成数字并生成 dist，分别检查 .js 文件是否还保留类型标注。',
    independentPractice: '建立两个入口，一个故意传入错误类型，一个只在运行时触发 undefined 属性访问；分别运行 tsc 与 node，写下哪个命令失败、退出码是多少、失败发生在源码还是生成代码。',
    commonErrors: [
      '把 TypeScript 当成运行时语言，误以为类型注解会在浏览器或 Node 中执行检查。',
      '只看编辑器红线而不用 tsc --noEmit 验证，项目中可能存在被静默忽略的文件。',
    ],
    sourceRefs: [TS_DOCS, TS_REPO, ECMA],
    steps: [
      [
        '编译流水线',
        'tsc 读取入口文件后先进行词法与语法解析，构造 AST；绑定阶段把符号放进作用域，检查器再根据声明和赋值推导类型，只有所有诊断通过才写出 JavaScript。若源码写 const count: number = "3"，检查器报告 TS2322，命令以非零状态结束；用 npx tsc --noEmit --pretty false 可把文件名、行列和错误码原样交给 CI。',
        '类型判断发生在生成代码之前',
      ],
      [
        '类型擦除与保留语法',
        '类型注解、interface、type 和泛型参数只服务检查，通常不会出现在生成的 JavaScript 中；class、enum 以及部分装饰器语法会留下运行时语句。用 npx tsc 生成 dist/main.js 后搜索是否还有 : number，再用 node dist/main.js 执行。失败边界是开发者以为 as 断言会验证数据，实际上 as 只影响检查器；应在运行时入口用真实断言或解析器验证。',
        '断言不等于运行时检查',
      ],
      [
        'tsc 诊断与退出码',
        '项目应固定命令 npx tsc -p tsconfig.json --noEmit，CI 直接检查退出码而不是抓取控制台文字。诊断包含 TS 错误码、文件路径、行列和消息，多个文件会一次报告多条；需要查看实际合并配置时运行 npx tsc --showConfig。失败边界是脚本吞掉 stderr 或使用; true 结束命令，导致红灯变绿；验证动作是故意制造一个类型错误，确认本地与 CI 都返回非零。',
        '命令行退出码是质量门禁事实',
      ],
      [
        'lib 声明不等于运行时能力',
        'lib 决定检查器认为哪些标准全局对象存在，不会向 Node 注入 document 或向旧浏览器注入 Promise。若 tsconfig 写 lib: ["ES2022", "DOM"]，document.title 可以通过检查，但在没有 DOM 的 Node 中执行仍会抛 ReferenceError；服务端项目通常使用 ES2022 加 @types/node，并通过 types 字段限制自动加载的声明。验证动作是在同一文件分别运行 tsc 与 node，记录类型通过但运行失败的边界。',
        '声明文件描述环境而不创建环境',
      ],
      [
        '源码到多类产物',
        '生产配置可设置 rootDir: "src"、outDir: "dist"、declaration: true、sourceMap: true 与 noEmitOnError: true，再运行 npx tsc -p tsconfig.json。生成目录应同时出现 main.js、main.d.ts 和 main.js.map，其中 .d.ts 只保留公开类型形状，source map 把报错位置映射回源码。失败边界是清空 dist 后没有重新构建却继续发包；验证动作是删除产物、重建、检查文件时间与入口加载结果。',
        '入口、声明和映射要一起验收',
      ],
    ],
  },
  {
    name: tsName(t0Stage, 'tsconfig strict、target、module 与 lib'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已经运行过一次 tsc，能读懂 TS 错误码并能定位 tsconfig.json。',
    goal: '能解释 strict、target、module、moduleResolution 与 lib 各自影响什么，能通过 showConfig 和产物确认配置覆盖关系，并知道哪些选项只改变检查或生成而不改变运行时。',
    guidedPractice: '建立带 extends 的 tsconfig.json，打开 strict、NodeNext 和 declaration，运行 npx tsc --showConfig 找出最终生效的 include、moduleResolution 与 lib；随后分别把 target 改成 ES5 和 ES2022，对比同一段可选链的生成结果。',
    independentPractice: '用一个最小项目验证 module: NodeNext 下的相对导入必须写 .js 扩展名；再切换到 Bundler，记录两条 tsc 输出与 Node 运行结果，解释为什么选择不同的模块解析需要配合不同的发布方式。',
    commonErrors: [
      '只写了严格检查命令，却没有把 strict 或更细的严格选项写入共享 tsconfig。',
      '把 lib 当成 polyfill 列表，或者把 moduleResolution 当成运行时模块加载器。',
    ],
    sourceRefs: [TS_CONFIG, TS_MODULES, ECMA],
    steps: [
      [
        '配置继承与文件集合',
        'tsconfig 通过 extends 合并基础配置，子配置的 compilerOptions 覆盖父级，include 与 exclude 决定参与项目的文件集合，但被导入的文件仍可能进入图。运行 npx tsc --showConfig 能展开最终配置、files 和 include，不会凭编辑器提示猜测。失败边界是 include 写成 dist 或测试夹具目录后把生成代码再次检查；验证动作是检查 showConfig 的文件列表，并删除一个误纳入文件后确认诊断消失。',
        '先确认哪些文件真正进入项目',
      ],
      [
        'strict 是一组检查开关',
        'strict: true 不是单一算法，它会打开 noImplicitAny、strictNullChecks、strictFunctionTypes、useUnknownInCatchVariables 等约束。示例 function label(value) { return value.name } 在 noImplicitAny 下报参数隐式 any，const name: string = null 在 strictNullChecks 下失败。失败边界是团队只在新目录启用严格模式而共享配置仍是 false；验证动作是运行 tsc，逐项检查诊断代码，并在 CI 固定同一配置。',
        '严格模式改变的是检查面',
      ],
      [
        'target 控制保留多少新语法',
        'target 决定 tsc 把 async、类字段、迭代和可选链降级到什么语法，也会决定默认 lib 的一部分。把 target 从 ES2022 降到 ES5 时，可选链会被改写成条件表达式，class 字段与异步函数可能需要额外运行时辅助；它不会自动补齐缺失的 Promise 或 DOM API。失败边界是只改 target 却不检查浏览器兼容与 polyfill；验证动作是保存两份 dist 产物并对目标环境运行真实用例。',
        '降级语法不能降级运行时库',
      ],
      [
        'module 与 moduleResolution 配合',
        'module 决定生成 import、require 还是 bundle 友好的语法，moduleResolution 决定检查器如何找到被导入文件与包。NodeNext 会同时读取 package.json 的 type、exports 和扩展名规则，所以 ESM 源码常用 import "./math.js"；Bundler 模式允许省略扩展名并由打包器处理。失败边界是源码能通过编辑器但 Node 找不到模块；验证动作是运行 tsc 后再用目标运行时加载入口。',
        '解析规则必须与运行时一致',
      ],
      [
        'lib、types 与 skipLibCheck 边界',
        'lib 选择标准库声明，types 选择自动加载的 @types 包，skipLibCheck 只跳过声明文件内部检查，不会跳过自己源码的错误。Node 项目若误把 DOM 加进 lib，可能允许 document 却让浏览器专属类型污染全局；若缺少 ES2022，Promise.allSettled 等形状不可见。失败边界是升级依赖后只靠 skipLibCheck 掩盖冲突；验证动作是分别移除一个 lib 或 types，观察诊断是否精确出现。',
        '全局声明来源要可解释',
      ],
    ],
  },
  {
    name: tsName(t0Stage, '基础类型、推断与类型注解'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能在 TypeScript 中声明变量和函数，并理解 tsc 会做静态检查。',
    goal: '能区分 primitive、literal、联合与特殊类型，说明推断与上下文推断何时发生，学会在公共边界写注解而在局部让检查器推导。',
    guidedPractice: '在一个文件中分别写下 let status = "open"、const status = "open" 和 const config = { status: "open" } as const，用编辑器的悬停类型和 expect-type 记录三者差异；再把 JSON.parse 的结果声明为 unknown，尝试读取属性并观察错误。',
    independentPractice: '为一个配置读取函数设计 unknown 入参和 Result 返回值，要求局部变量不写多余注解、公共参数与返回值明确；用三条 @ts-expect-error 测试非法输入确实被拒绝，同时运行真实 Vitest 用例验证运行时分支。',
    commonErrors: [
      '给每个局部变量都写显式类型，反而丢失更精确的推断结果与重构信号。',
      '把 any 当成未知数据的安全入口，导致属性访问和错误拼写都绕过检查。',
    ],
    sourceRefs: [TS_HANDBOOK, TS_DOCS, ECMA],
    steps: [
      [
        'primitive 与字面量拓宽',
        'string、number、boolean 描述一组值，而 "open" 只描述一个值。let status = "open" 默认拓宽为 string，允许后续赋 "closed"；const status = "open" 保留字面量，对象属性则可能再次拓宽，需要 const config = { status: "open" } as const 固定嵌套值。失败边界是把可变状态误标成单一字面量，后续合法状态迁移全部报错；验证动作是查看符号悬停类型并对两个赋值分支运行 tsc。',
        '可变性与字面量精度要一起看',
      ],
      [
        '推断与上下文推断',
        '赋值和 return 会从右侧表达式推导类型；回调参数则可由函数签名从上下文获得，例如 ["1", "2"].map((value) => value.trim()) 不必重复声明 value: string。空数组 const rows = [] 在后续 push 时采用 evolving any[]，因此跨边界前要写 string[]。失败边界是抽取函数时删掉参数注解，导致调用方上下文无法回推；验证动作是检查推断签名并在参数上补最小注解。',
        '推断依赖上下文而不是猜测',
      ],
      [
        'any、unknown 与 never',
        'any 会关闭该值的成员检查并把污染扩散到相邻表达式；unknown 要求先使用 typeof、in 或解析器收窄，适合 JSON、配置和异常；never 表示不可能返回或不可能有值，assertNever 与抛错函数常用它。JSON.parse 的签名返回 any，所以入口应立即保存为 const parsed: unknown。失败边界是在 unknown 上直接 as User 冒充验证；验证动作是同时运行 tsc 与非法 JSON 的运行时测试。',
        '未知输入先收窄再使用',
      ],
      [
        'null、undefined 与运行时缺失',
        'strictNullChecks 让 null 和 undefined 不再隐式属于所有类型，可选属性 user?.address?.zip 与空值合并 user.name ?? "匿名" 能表达缺失。非空断言 user!.address.zip 只告诉检查器忽略风险，不会在运行时生成保护；数据缺失时仍抛 TypeError。失败边界是把默认值当成所有字段都存在的证明；验证动作是构造 {}、null 与部分字段三组夹具，运行函数并检查输出。',
        '断言不会补救缺失数据',
      ],
      [
        '公共边界注解与内部推断',
        '导出函数的参数与返回值影响调用方契约，适合显式写出；局部临时值让检查器推断，可减少重复并让重构自动传播。示例 function parseConfig(raw: unknown): Config 中参数保持 unknown，内部通过 typeof 和字段检查逐层收窄，返回处必须构造完整 Config。失败边界是把内部私有类型意外导出成公共契约；验证动作是生成 .d.ts，确认公开签名没有泄漏未导出的实现细节。',
        '注解应集中在稳定边界',
      ],
    ],
  },
  {
    name: tsName(t0Stage, '函数、对象、数组与元组'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '掌握 JavaScript 的函数、对象和数组语法，能在 TypeScript 中读取基本的函数签名。',
    goal: '能用函数签名表达可选参数、返回值和回调约束，区分数组与只读数组、对象结构与元组位置，并识别结构类型和 excess property check 的边界。',
    guidedPractice: '写一个 createRange(start: number, end: number, step?: number): readonly number[]，再写一个接受 [number, number] 的坐标函数；分别传入三元素数组、对象字面量和通过变量传入的额外字段，记录 tsc 在何处报错以及运行时实际收到什么。',
    independentPractice: '为一个二维点实现 normalize(point: readonly [number, number]): readonly [number, number]，再给批量处理函数加上 readonly 数组参数；用正常点、越界点和错误长度输入写测试，要求类型错误与运行时错误都留下记录。',
    commonErrors: [
      '把普通数组当成固定长度元组，导致长度和位置约束被悄悄放宽。',
      '以为 TypeScript 会删除对象上的额外运行时字段，实际上结构检查只影响类型层。',
    ],
    sourceRefs: [TS_HANDBOOK, TS_DOCS, ECMA],
    steps: [
      [
        '函数参数与返回契约',
        '函数签名用可选参数、默认值和 rest 参数表达调用方式，返回类型把成功值固定给调用方。例如 function join(parts: readonly string[], separator = ","): string 中 separator 可省略，parts 保持只读；返回 void 表示调用结果不应被消费，不代表函数一定没有副作用。失败边界是把可能返回 undefined 的函数写成 string；验证动作是删除 return 分支后运行 tsc，并检查调用方是否被迫处理空值。',
        '调用形状由签名而不是实现猜测',
      ],
      [
        '对象的结构类型',
        'TypeScript 默认采用结构类型：只要对象拥有所需属性就能赋值，不要求来自同一个 class。直接写 const point: Point = { x: 1, y: 2, z: 3 } 会触发 excess property check，而先保存到变量再赋值可能允许额外字段，因为变量类型已包含这些字段。失败边界是把额外字段当作被编译删除，实际对象在运行时仍保留它们；验证动作是打印 Object.keys 并同时检查赋值位置。',
        '额外属性检查不是字段擦除',
      ],
      [
        '数组、只读数组与可变性',
        'string[] 允许 push、splice 和下标写入，readonly string[] 只提供读取与遍历，适合函数参数和共享状态。Readonly 只改变类型检查，不会自动调用 Object.freeze；把普通数组赋给 readonly 参数后，原持有者仍可修改。失败边界是代码同时保留可变别名却声称状态不可变；验证动作是尝试在函数内 push 并确认 TS2339，再在运行时冻结并验证写入行为。',
        'readonly 是对调用方的约束',
      ],
      [
        '元组固定位置与长度',
        '元组用 [number, number] 表达固定长度和逐位类型，readonly [number, number] 进一步阻止写入；[string, ...number[]] 可表达至少一个字符串的变长结构。const pair = [1, 2] 默认推断 number[]，只有 as const 或显式 tuple 注解才保留两个槽位。失败边界是函数接收普通数组后仍假定长度；验证动作是传入长度 0、1、2 的输入，并在正文中记录 destructuring 结果。',
        '位置语义不能靠数组约定',
      ],
      [
        '重载与回调的检查边界',
        '函数重载先声明多个调用签名，再提供一个兼容所有签名的实现；调用方只看公开签名，实现内部必须自行判断参数。将回调传给 strictFunctionTypes 下的 API 时，参数位置会做逆变检查，错误的窄化回调不能冒充宽回调。失败边界是重载实现漏处理某个输入却没有运行时守卫；验证动作是给每个重载分支写调用样例，并运行 tsc 与测试。',
        '公开签名和实现都要覆盖',
      ],
    ],
  },
  {
    name: tsName(t0Stage, 'interface、type 与声明合并'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能写对象类型、函数类型，并知道 .d.ts 文件只包含声明。',
    goal: '能根据开放扩展、封闭联合和公共 API 的需求选择 interface 或 type，理解同名 interface 合并、type alias 不可合并以及模块增强的风险。',
    guidedPractice: '在同一文件中声明两次 interface User，观察字段自动合并；再写两次 type Role，记录重复标识符错误；最后创建 declare module "./client.js" 的增强声明，给 Client 增加一个 trace 方法并运行 tsc 验证调用可用。',
    independentPractice: '为一个插件系统设计宿主 interface 与插件 type，其中一个模块通过声明合并扩展宿主、另一个模块使用联合类型描述事件；生成 .d.ts 后检查消费者能否只导入公开符号。',
    commonErrors: [
      '以为 type alias 也能像 interface 一样做同名声明合并。',
      '在应用代码滥用 declare module 修改第三方类型，却没有把增强放入可加载的声明入口。',
    ],
    sourceRefs: [TS_HANDBOOK, TS_DECLARATION, TS_MODULES],
    steps: [
      [
        'interface 的开放扩展',
        '同名 interface 会在同一作用域合并字段，后面的声明可以补充方法或属性，这被库作者用于模块增强。示例 interface Client { request(): Promise<void> } 再加 interface Client { trace(id: string): void } 后，类型同时拥有两个成员。失败边界是同名声明来自不同版本或不同包，字段冲突时诊断位置可能远离真正加载点；验证动作是只导入增强入口前后分别运行 tsc。',
        '合并是同一实体的增量声明',
      ],
      [
        'type alias 的封闭组合',
        'type 可以精确表达联合、交叉、条件类型、映射类型和元组别名，但不能用第二次同名声明追加成员。type Result = { ok: true } | { ok: false } 的每个分支都是封闭契约，适合业务状态；重复 type Result 会报重复标识符。失败边界是把公共联合 alias 当作可扩展插件点；验证动作是让一个新成员尝试合并，确认 tsc 立即拒绝。',
        '联合边界需要显式修改源头',
      ],
      [
        '索引签名与键集合',
        'interface Dictionary { [key: string]: number } 允许任意字符串键，却会让 d.missing 也看起来是 number；Record<"left" | "right", number> 把键限制为两个字面量。开启 noUncheckedIndexedAccess 后，动态字符串索引会额外得到 undefined，必须检查。失败边界是用索引签名替代真实字段模型；验证动作是读取一个不存在的键，并在运行时与类型层各记录一次结果。',
        '任意键与有限键要分清',
      ],
      [
        '调用签名与对象成员组合',
        '函数也是对象，可以用 type Parser = ((raw: string) => User) & { version: string } 同时描述调用结果和附带元数据；interface 则可以把 call signature 与属性写在同一份契约里。二者都能表达混合形状，差别在于后续合并与命名习惯。失败边界是误以为每份实现都要继承 interface；验证动作是写一个普通箭头函数并附加 version 属性，检查赋值与调用都通过。',
        '可调用对象也有结构契约',
      ],
      [
        '声明增强与入口可达性',
        '模块增强使用 import 引入目标模块，再在 declare module "./client.js" 中重复 interface，消费者的 tsconfig 必须实际包含这份声明。增强会改变全局类型图，不能随手放在测试文件里；失败边界是声明文件没有被 package exports 或 types 暴露，发布后调用方完全看不到新增方法。验证动作是单独建立消费者工程，只依赖打包产物并运行 tsc。',
        '增强必须进入发布契约',
      ],
    ],
  },
  {
    name: tsName(t0Stage, '严格模式下的第一项目'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能编写包含导入导出、对象和函数的 TypeScript 文件，并会用 pnpm 安装开发依赖。',
    goal: '能从空目录搭起 strict 类型化项目，分离类型检查与构建配置，建立模块入口、错误返回和可重复的 CI 命令。',
    guidedPractice: '跟随流程执行 pnpm init、pnpm add -D typescript，创建 src/index.ts、src/domain.ts 与 tsconfig.json；把 noUncheckedIndexedAccess 和 exactOptionalPropertyTypes 打开，制造一次索引空值和可选属性赋值错误，再用 pnpm typecheck 修正。',
    independentPractice: '独立完成一个配置解析小项目，要求入口接收 unknown、校验必填字段、返回 Result，并提供 typecheck 与 build 两个脚本；删除 dist 后从零构建，再用 node 加载生成入口验证成功与失败分支。',
    commonErrors: [
      '把 typecheck 和 build 混成一个会写盘的命令，导致检查失败时仍留下半成品产物。',
      '只打开 strict 却忽略 noUncheckedIndexedAccess、exactOptionalPropertyTypes 等与真实数据相关的边界。',
    ],
    sourceRefs: [TS_CONFIG, TS_HANDBOOK, TS_DOCS],
    steps: [
      [
        '项目骨架与依赖',
        '先运行 pnpm init，再用 pnpm add -D typescript 固定编译器版本，package.json 写 type: "module" 与 scripts.typecheck: "tsc --noEmit"。不要把 tsc 放在生产依赖里，也不要用全局版本替代仓库版本；失败边界是本地与 CI 使用不同 TypeScript 主版本，诊断和生成结果漂移。验证动作是运行 pnpm exec tsc --version，并与锁文件中的版本对照。',
        '编译器版本属于项目依赖',
      ],
      [
        'tsconfig 分层',
        '基础 tsconfig.json 负责 strict、target、module、lib 和 include: ["src"]；构建另用 tsconfig.build.json 设置 outDir、declaration 与 noEmitOnError。类型检查使用 tsc --noEmit，构建使用 tsc -p tsconfig.build.json。失败边界是两个配置的 rootDir 不一致导致产物嵌套；验证动作是运行 tsc --showConfig 与 find dist，确认入口位置稳定。',
        '检查配置与发布配置各司其职',
      ],
      [
        '模块边界与显式入口',
        'src/index.ts 只重新导出稳定公开 API，domain.ts 保存领域形状与校验函数，适配层负责读取外部数据。NodeNext 模式下相对导入写 ./domain.js，检查器与运行时都能找到生成文件。失败边界是从内部文件深导入形成隐式公共契约；验证动作是消费者只导入 index，再尝试移除一个内部导出确认外部依赖。',
        '公开入口限制耦合方向',
      ],
      [
        'Result 与错误边界',
        '项目内部不要用抛错和返回 null 混杂表达预期失败。定义 type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }，解析函数在每个失败分支返回结构化错误，调用方通过 if (!result.ok) 收窄。失败边界是 catch 仍写 any 并吞掉原始 cause；验证动作是测试空输入、非法 JSON 与字段缺失三种分支。',
        '预期失败是返回值的一部分',
      ],
      [
        '严格项目的硬化清单',
        '在第一项目最后检查 strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、noImplicitOverride 与 isolatedModules 是否适合当前构建链。每项都应有理由，不能为了消错一次性全关；还要确认生成 .d.ts、source map 和入口文件齐全。失败边界是配置通过却无法被真实消费者加载；验证动作是删除 node_modules 外的构建缓存，重新 typecheck、build、node dist/index.js。',
        '严格检查必须与产物验收同时成立',
      ],
    ],
  },
];

const t1Stage = '联合、收窄、泛型与工具类型';

const TYPESCRIPT_T1_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: tsName(t1Stage, '联合、交叉与字面量类型'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能读写对象类型、函数类型，并理解类型在编译后会被擦除。',
    goal: '能用联合表达多选、交叉表达同时满足、字面量表达封闭取值，区分类型错误与运行时选择，并用判别字段让分支保持可读。',
    guidedPractice: '写下 type Id = string | number 与 type SaveResult = { ok: true; id: Id } | { ok: false; message: string }，分别调用 toFixed 与 id.trim，记录联合成员不共有方法时的报错；再给 SaveResult 增加第三个成功分支，观察未处理分支的类型结果。',
    independentPractice: '把一组用 string 表示的状态函数改为字面量联合，并为每个状态补对应载荷；实现打印函数时先判断 kind，再用 never 检查是否有遗漏，最后用 expect-type 锁定返回值。',
    commonErrors: [
      '在未收窄的联合类型上直接调用只属于某个成员的方法。',
      '把交叉类型当成运行时对象合并，忽略冲突字段会直接得到 never。',
    ],
    sourceRefs: [TS_HANDBOOK, TS_NARROWING, TS_DOCS],
    steps: [
      [
        '联合只暴露共有能力',
        'string | number 表示值可以是任一成员，但检查器只允许调用两者都拥有的操作；对 value.toFixed 会报成员不存在，要先写 typeof value === "number" 才能收窄。联合成员越多，分支处越需要显式证据。失败边界是用 as 强制断言某个狭窄成员；验证动作是分别传入字符串和数字，再用 tsc 与运行时输出确认两条分支。',
        '联合值的操作要先证明成员',
      ],
      [
        '字面量与 const 精度',
        'type Status = "draft" | "paid" | "cancelled" 把可接受字符串限制为三个值，函数 status: Status 会拒绝任意字符串。普通 const 只固定变量绑定，对象字段仍可能拓宽，const config = { status: "draft" } 中 status 可被推成 string；as const 保留嵌套字面量。失败边界是接口仍接收 string 后再赋给 Status；验证动作是检查函数签名并把外部输入留在 unknown 或 string 边界。',
        '封闭取值要一直保持到入口',
      ],
      [
        '交叉表示同时满足',
        'A & B 要求同一值同时满足 A 与 B，字段合并后可获得双方成员。若 A 的 kind 是 "a" 而 B 的 kind 是 "b"，A & B 不会变成双状态，只会把 kind 缩成 never，赋值对象无处可选。失败边界是用交叉表示互斥分支；验证动作是尝试构造冲突字段，并观察错误落在具体属性上。',
        '交叉是约束叠加而不是分支选择',
      ],
      [
        '判别联合让分支可验证',
        'type Event = { type: "created"; id: string } | { type: "failed"; reason: string } 使用共同的 type 字段区分成员，switch (event.type) 后每支能看到独有载荷。判别字段应当是字面量且稳定，不能从外部任意字符串推断。失败边界是数据解析前就断言 Event，运行时可能根本没有 type；验证动作是为每种输入写构造样例并运行分支测试。',
        '判别字段为每个分支提供证据',
      ],
      [
        '联合归一化与赋值实验',
        '联合中重复成员会被合并，boolean 本质是 true | false，嵌套联合会扁平化；satisfies 可检查对象符合接口同时保留精确字面量。为公开函数写 type Parser = (input: string) => { ok: true; value: number } | { ok: false; error: string }，再让两个实现接收它。失败边界是把联合返回值当成一定有 value；验证动作是在调用处检查 ok 后再访问字段，并用 @ts-expect-error 固定错误分支。',
        '每次访问都必须由判别结果驱动',
      ],
    ],
  },
  {
    name: tsName(t1Stage, 'typeof、in、instanceof 与类型守卫'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '理解联合类型和运行时的 typeof、in、instanceof 行为。',
    goal: '能用 TypeScript 的控制流收窄识别运行证据，编写类型谓词和断言函数，并看清 null、跨 realm、原型链与伪造字段带来的失败边界。',
    guidedPractice: '从 unknown 输入开始，依次用 typeof value === "string"、Object.hasOwn(value, "id") 与 value instanceof Date 收窄，打印每种判断前后的类型；再把 in 判断改成读取继承属性，观察运行时结果变化。',
    independentPractice: '为一条外部消息实现 isMessage(value: unknown): value is Message，要求命令、载荷和版本字段都能验证；再写一个 assertMessage 断言函数，使调用后的作用域自动收窄，并用非法对象测试两者。',
    commonErrors: [
      '在 unknown 上直接写 value.__typename 或 value.id，忽略运行时数据没有类型保证。',
      '类型谓词只写返回 boolean，没有写 value is T，调用方无法获得收窄。',
    ],
    sourceRefs: [TS_NARROWING, TS_HANDBOOK, MDN],
    steps: [
      [
        'typeof 的收窄范围',
        'typeof value === "string"、=== "number"、=== "function" 等会让联合分支自动缩小，但 typeof null 结果仍是 object，数组也返回 object。检查数字时要处理 NaN，可结合 Number.isFinite；检查 null 要单独 value !== null。失败边界是把 typeof value === "object" 当成所有对象都有效；验证动作是传入 null、数组和普通对象，观察三者在运行时的不同结果。',
        'typeof 结果比业务类型更粗',
      ],
      [
        'in 运算符与自有属性',
        'in 检查属性名是否存在于原型链，Object.hasOwn 只检查对象自身属性。unknown 先确认是对象，再写 "kind" in value 可让联合中的对应成员出现；外部 JSON 使用 Object.hasOwn(value, "kind") 更精确。失败边界是攻击者在 prototype 上设置字段导致 in 通过；验证动作是构造带原型属性与自有属性的两个对象，分别记录结果。',
        '属性存在不等于值可信',
      ],
      [
        'instanceof 的类身份',
        'value instanceof Date 依据原型链识别构造器实例，收窄后可以调用 Date 方法；自定义 class 也能用同样方式。instanceof 不能跨 iframe 或不同 realm 保持同一构造器身份，结构化克隆后的对象也会变成普通对象。失败边界是网络 DTO 直接被当作类实例；验证动作是在边界只接收 primitives 或 plain object，并在本地重新构造类实例。',
        'instanceof 描述真实对象链',
      ],
      [
        '用户定义类型谓词',
        '函数 isUser(value: unknown): value is User 返回布尔值，同时告诉检查器 true 分支可当作 User。谓词内部必须真的检查关键字段，不能只写 return true；谓词写错属于声明的可信漏洞。断言函数 function assertUser(value: unknown): asserts value is User 在失败时抛错，成功返回后整个作用域收窄。失败边界是谓词与运行时校验逻辑分叉；验证动作是共享同一字段谓词并覆盖非法值。',
        '守卫主张与实现必须同源',
      ],
      [
        '复合输入的分层守卫',
        '外部消息先检查是普通对象，再检查 version 是否支持、kind 是否在白名单、payload 是否满足该 kind，最后构造领域对象。每层失败返回带路径的错误，不要用 try/catch 包裹一个空断言。失败边界是只校验最外层字段而信任嵌套字段；验证动作是生成缺失字段、数组、null 和未知 kind 四类夹具，并用 tsc 证明分支访问合法。',
        '嵌套数据要逐层取得证据',
      ],
    ],
  },
  {
    name: tsName(t1Stage, '泛型约束、默认参数与推断'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能写基本泛型函数，理解类型参数在编译后不会生成运行时参数。',
    goal: '能用约束表达输入必备能力，用默认类型参数稳定公共 API，理解参数位置对推断的影响，并会用 NoInfer 与 const 类型参数控制过宽或过窄的推导。',
    guidedPractice: '实现 function getId<T extends { id: string }>(value: T): T["id"]，再写 type ApiResponse<T, E = ApiError>；删除一个参数的泛型实参观察推断结果，最后给 tuple 函数加 const T，比较调用后元组是否保留字面量。',
    independentPractice: '为一个事件注册函数设计泛型 map，要求事件名和载荷通过 keyof 关联；用默认错误类型保持现有调用兼容，并用 expect-type 验证合法调用与错误事件载荷都会被拒绝。',
    commonErrors: [
      '给泛型参数添加过强约束，导致本来只需要 id 的函数无法接收其他实体。',
      '在调用处反复手写泛型实参，掩盖了参数设计导致的推断失败。',
    ],
    sourceRefs: [TS_GENERICS, TS_HANDBOOK, TS_DOCS],
    steps: [
      [
        '类型参数保存输入关系',
        'function identity<T>(value: T): T 的返回类型跟随输入，而不是固定成 string 或 unknown。调用 identity({ id: "a" }) 会得到包含 id 的对象类型，调用 identity(1) 会得到 number。失败边界是把输入标成 unknown 后不再关联返回；验证动作是查看调用处的推断类型，并让两个不同输入各自保留形状。',
        '泛型用于连接输入与输出',
      ],
      [
        '约束提供最小能力',
        'T extends { id: string } 只要求输入拥有 id，其他字段仍被保留；函数 getId<T extends { id: string }>(value: T): T["id"] 因此能返回精确的字符串标识。约束越窄，函数可用范围越小；若只需要 id，不必要求完整 User。失败边界是约束设为具体 User 导致测试替身无法传入；验证动作是分别传入完整实体与最小对象。',
        '约束只写实现真正需要的成员',
      ],
      [
        '默认类型参数稳定调用',
        'type ApiResponse<T, E = ApiError> 让常见调用只写成功值，需要特殊错误时再传第二个参数，避免每次重复默认错误类型。默认参数仍必须满足约束，且不能依赖未声明的后续参数。失败边界是把默认类型写成任何错误共享的 any；验证动作是生成 .d.ts，检查默认值是否进入公开签名并写一条旧调用兼容测试。',
        '默认值服务现有调用者',
      ],
      [
        '推断位置与 NoInfer',
        'function choose<T>(items: readonly T[], fallback: T): T 会同时从数组与 fallback 推断 T，较宽的 fallback 可能把字面量联合扩大。使用 fallback: NoInfer<T> 可规定只从 items 推断，再用参数位置约束 fallback。失败边界是 NoInfer 被当成运行时函数；验证动作是分别传入 ["a", "b"] 与 "c"，检查返回类型和错误提示。',
        '限制推断来源能让类型更稳定',
      ],
      [
        'const 类型参数与方差',
        'function tuple<const T extends readonly unknown[]>(items: T): T 会尽量保留调用处的字面量与只读元组，而不是扩大成数组元素联合。协变、逆变和双变体现在回调参数、返回值与可变位置上，strictFunctionTypes 会收紧函数参数赋值。失败边界是为保留字面量滥用 as const；验证动作是对同一调用比较普通 T 与 const T 的声明输出。',
        '推断精度也属于 API 设计',
      ],
    ],
  },
  {
    name: tsName(t1Stage, 'keyof、索引访问与映射类型'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能使用泛型约束，并理解对象类型由属性名与属性值组成。',
    goal: '能用 keyof 与索引访问建立键值联动，用映射类型批量变换对象形状，掌握修饰符、键重映射和元组索引的边界。',
    guidedPractice: '实现 getValue<T, K extends keyof T>(obj: T, key: K): T[K]，传入用户对象验证返回类型随 key 变化；再把 User 映射成只读可选版本，删除 readonly 与可选修饰符，比较每个属性的状态。',
    independentPractice: '把一个配置对象的键统一加 on 前缀生成事件表，同时保留每个值类型；用 noUncheckedIndexedAccess 打开后检查动态数组索引，并写三条 expect-type 断言验证映射结果。',
    commonErrors: [
      '把 keyof T 当成 string，导致任意字符串都能索引对象。',
      '映射类型中直接写 { [K in keyof T]: T[K] } 却忘记保留可选性与只读性。',
    ],
    sourceRefs: [TS_MAPPED, TS_HANDBOOK, TS_DOCS],
    steps: [
      [
        'keyof 与索引访问联动',
        'keyof User 得到 "id" | "name" 等键联合，T[K] 得到对应值类型；K extends keyof T 保证传入的 key 来自对象。getValue(user, "id") 返回 string，传入 "missing" 会在调用处报错。失败边界是把对象拓宽成 Record<string, unknown> 后失去键精度；验证动作是保留具体接口并检查两个键的返回类型。',
        '键和值必须由同一类型连接',
      ],
      [
        '数组与元组的索引访问',
        '数组类型 User[] 的 User[number] 是元素类型，元组 [string, number] 的 T[0] 与 T[1] 分别得到位置类型。typeof pair[0] 不会自动变成通用取值类型，常需定义 type First<T extends readonly unknown[]> = T[0]。失败边界是把数组元素索引结果当作一定存在；验证动作是打开 noUncheckedIndexedAccess 后读取动态下标。',
        '索引访问保留容器位置信息',
      ],
      [
        '基础映射与属性修饰符',
        'type PartialUser = { [K in keyof User]?: User[K] } 批量添加可选修饰符，type Mutable<T> = { -readonly [K in keyof T]: T[K] } 去掉只读，type Readonly<T> 则增加只读。映射类型会保留健名集合，并可通过 +? 或 -? 控制可选性。失败边界是假设映射会自动深拷贝；验证动作是在运行时修改嵌套对象并检查原值。',
        '映射只改变类型形状',
      ],
      [
        '键重映射与子集投影',
        'type EventMap<T> = { [K in keyof T as `on${Capitalize<string & K>}`]: T[K] } 把每个键改名并保留对应值类型。string & K 缩小模板字面量需要的字符串约束；若键包含 symbol，需要先过滤。失败边界是重映射产生重复键，后一个映射覆盖前一个；验证动作是用 expect-type 检查目标键集合，并构造两个可能冲突的源键。',
        '键变换要先定义冲突规则',
      ],
      [
        '映射组合与可读性取舍',
        'Pick、Omit、Partial、Required 常由映射类型组合而成，复杂链式工具类型会把错误位置推得很远。优先给关键中间类型命名，例如 type PublicUser = Omit<User, "passwordHash">，而不是在一个表达式里叠五层条件。失败边界是工具类型返回 never 却没有定位到哪个键失败；验证动作是拆开中间别名，并用 --generateTrace 观察实例化数量。',
        '中间类型名也是调试工具',
      ],
    ],
  },
  {
    name: tsName(t1Stage, '条件类型、infer 与模板字面量'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '掌握泛型、联合类型与映射类型，能阅读 TypeScript 的条件类型声明。',
    goal: '能解释裸类型参数的分发行为，使用 infer 提取函数、Promise 和元组内部类型，并用模板字面量构造可收窄的字符串契约。',
    guidedPractice: '定义 type Unwrap<T> = T extends Promise<infer U> ? U : T，比较 Promise<string> 与 string 的结果；再写 Head<T> 与 Tail<T> 递归提取元组，并用 type OnEvent<K extends string> = `on${Capitalize<K>}` 生成事件名。',
    independentPractice: '为一个异步 API 写返回值提取器，覆盖 Promise、嵌套 Promise 与普通值；再写一个不超过三层的路由参数模板类型，用 expect-type 检查合法与非法路由，并用 tsc --extendedDiagnostics 记录实例化规模。',
    commonErrors: [
      '忽略裸类型参数会分发联合，导致条件结果意外变成多项联合。',
      '无终止条件地递归模板字面量，让检查器类型展开无限增长。',
    ],
    sourceRefs: [TS_CONDITIONAL, TS_HANDBOOK, TS_DOCS],
    steps: [
      [
        '条件类型与分发',
        'T extends Constraint ? A : B 在 T 是裸类型参数时会按联合成员分发，type Boxed<T> = T extends string ? { text: T } : T 对 A | B 得到两个分支后再联合。若希望整体判断，可写 [T] extends [Constraint] 阻止分发。失败边界是把分发结果当成对象一致性；验证动作是分别传单个字符串与字符串联合，观察结果结构。',
        '联合遇到裸参数会逐支判断',
      ],
      [
        'infer 提取内部形状',
        'Promise<infer U> 在模式匹配成功时把内部值绑定给 U；ReturnType<T> 通过 T extends (...args: any[]) => infer R 提取返回值。类型别名中 infer 只在条件类型分支有效，不能当作运行时变量。失败边界是在函数重载或 any 上期待单一精确返回；验证动作是用普通异步函数、同步函数和 never 三组 expect-type 记录结果。',
        'infer 是模式匹配中的占位符',
      ],
      [
        '元组递归与终止条件',
        'type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never 提取首项，Tail 则先匹配 [unknown, ...infer R] 再返回 R。每次递归必须缩小输入，并为空元组提供失败分支，否则类型实例化没有终点。失败边界是把普通数组当作已知长度元组；验证动作是分别传 []、[1] 与 [1, 2]，确认结果与递归深度。',
        '递归类型必须先缩小输入',
      ],
      [
        '模板字面量构造键',
        '模板字面量类型可以拼接字面量并应用 Uppercase、Capitalize 等字符串工具，type Handler<K extends string> = `on${Capitalize<K>}` 能把 "save" 映射为 "onSave"。字符串联合会分发成有限键集合，也可能在模式匹配中抽取后缀。失败边界是输入仍是宽 string 时生成无限宽模板；验证动作是检查函数参数是否保留字面量联合。',
        '模板类型需要有限字面量输入',
      ],
      [
        '递归模板与直接成本',
        '深层路径、解析器和点号转换常写成递归模板类型，但每层联合都会复制类型实例，过深时编辑器响应变慢，tsc 可能报 excessively deep instantiation。应设置有限的键集合或层级上限，先用 --extendedDiagnostics 与 --generateTrace 测量。失败边界是用类型计算替代普通运行时解析；验证动作是把上限从三层降到两层，比较 trace 中的实例数量。',
        '类型表达能力受编译成本约束',
      ],
    ],
  },
  {
    name: tsName(t1Stage, '类型体操的边界与可读性'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能阅读条件类型、映射类型和泛型工具，并会使用 expect-type 或类型断言测试。',
    goal: '能判断何时值得使用类型级计算，识别编译性能与错误信息代价，并用命名、拆分和运行时解析替代难以维护的类型技巧。',
    guidedPractice: '选取一个三层条件类型表达式，先用 tsc --extendedDiagnostics 记录实例化数量与耗时，再拆成两个具名中间类型；比较错误消息在第几个文件、是否还能指出缺失属性，并把两次数字写进记录。',
    independentPractice: '为一个公开 SDK 审查复杂工具类型，分别给出保留、简化、改为运行时生成三种方案；选出一种后补 expect-type 测试、生成 .d.ts 并用消费者工程验证提示信息。',
    commonErrors: [
      '为了让调用处少写一个泛型参数，堆出多层条件类型，最终错误无法定位。',
      '在没有测试和性能记录时复制社区类型技巧，把框架内部实现当作业务契约。',
    ],
    sourceRefs: [TS_DOCS, TS_REPO, TS_CONDITIONAL],
    steps: [
      [
        '类型计算要承载业务语义',
        '把 DTO 的键映射成事件名、从路由表提取参数、从公开接口派生只读视图，都属于有业务收益的类型计算；用类型实现字符串计算器或迷宫则通常只适合教学。判断标准是它是否阻止真实非法调用、是否能被测试和文档解释。失败边界是类型技巧只在 IDE 中好看，运行时仍要重复校验；验证动作是找出一个对应运行时测试或生成步骤。',
        '类型技巧必须阻止真实错误',
      ],
      [
        '编译成本可测量',
        '运行 tsc --extendedDiagnostics 可查看 Types、Instantiations、Check time 与 Total time，--generateTrace 生成更细的 trace 文件。复杂类型或大型联合会让 Instantiations 数量显著上升，CI 可比较基线而不是凭感觉优化。失败边界是只测冷启动而忽略增量编辑；验证动作是修改一个触发类型的文件，比较前后数字和编辑器响应。',
        '性能判断要留下数字',
      ],
      [
        '错误信息也要设计',
        '复杂条件类型失败时，检查器可能展示巨大的展开结果；给中间类型命名、减少交叉、把非法分支映射到带消息的 never 形状，通常能改善定位。公开 API 还应避免把内部辅助类型直接暴露给用户。失败边界是类型测试只检查布尔结果却不检查错误路径；验证动作是故意传错参数，阅读诊断并记录能否直接指出字段。',
        '可诊断性与通过率同样重要',
      ],
      [
        '替代方案与生成代码',
        '当类型表达式需要模拟解析器、正则或大量键组合时，运行时生成器、JSON Schema、OpenAPI 或代码生成可能更稳定，生成文件也能被审阅。TypeScript 类型适合约束静态形状，不负责执行。失败边界是生成器产物未进入版本控制导致构建漂移；验证动作是比较生成前后的 diff，并在 CI 重新生成后确认无变化。',
        '能生成就不必在类型里解释',
      ],
      [
        '把技巧重构为契约测试',
        '最终检查应包括合法调用、非法调用、公开声明快照和消费者编译四类证据。先把复杂工具类型拆成稳定基础类型，再用 expect-type 锁定结果；删除不必要的内部技巧时，消费者测试必须保持通过。失败边界是重构只改了类型而运行时解析仍接受旧形状；验证动作是同一组合法/非法夹具同时经过类型检查和运行时解析。',
        '类型重构必须由消费者证据收口',
      ],
    ],
  },
];

const t2Stage = '领域建模与不可变状态';

const TYPESCRIPT_T2_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: tsName(t2Stage, '实体、值对象与标识符类型'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '掌握对象类型、readonly 与联合类型，能区分编译期结构和运行时对象。',
    goal: '能按身份区分实体与值对象，用品牌类型阻止不同标识符混用，并在输入边界通过构造函数建立合法值。',
    guidedPractice: '定义 type Money = Readonly<{ amount: number; currency: "CNY" }> 与 type Order = Readonly<{ id: OrderId; total: Money }>，分别比较两个 Money 和两个同字段 Order 的业务身份；再写一个 createMoney 函数拒绝负金额与多余小数。',
    independentPractice: '为订单标识和客户标识建立品牌类型，各自提供只接受运行时校验的 parse 函数；用 expect-type 验证两者不能互相赋值，并写测试确认非法字符串不会经由 as 以外的公开入口进入系统。',
    commonErrors: [
      '只用 string 表示所有标识符，导致订单 ID 与客户 ID 可以无提示互换。',
      '把 Readonly 当成深不可变保证，嵌套数组或对象仍能原地修改。',
    ],
    sourceRefs: [TS_HANDBOOK, TS_DOCS, ECMA],
    steps: [
      [
        '实体身份与值对象相等',
        '值对象由字段共同定义，两枚 amount 与 currency 相同的 Money 在业务上相等，适合按值比较；实体有独立身份，两笔订单即使字段完全一样，只要 id 不同就是不同对象。TypeScript 的结构类型不会自动实现业务判等，需要显式 equalMoney 与 equalOrderId。失败边界是用 JSON.stringify 比较对象，属性顺序和 undefined 会改变结果；验证动作是写正常值、不同币种和同字段不同 id 三组断言。',
        '判等规则来自领域而不是字段巧合',
      ],
      [
        '品牌标识符阻止互换',
        '可以声明 declare const orderIdBrand: unique symbol，再定义 type OrderId = string & { readonly [orderIdBrand]: "OrderId" }。普通字符串不能直接赋给 OrderId，只有 parseOrderId 在校验格式和长度后集中断言一次。失败边界是到处写 value as OrderId，把品牌退化成装饰；验证动作是搜索断言位置，并用 expect-type 检查订单与客户 ID 不能互传。',
        '品牌把构造权限收进边界',
      ],
      [
        '构造函数建立不变式',
        'createMoney(amount: number, currency: Money["currency"]): Money 应在构造时检查 Number.isFinite、amount >= 0 和两位小数规则，失败返回错误结果或抛领域错误，成功后返回冻结的普通对象。调用方只接收已经合法的 Money，不在每个函数重复检查。失败边界是用户输入直接 as Money；验证动作是覆盖 NaN、Infinity、负数和三位小数四组输入。',
        '非法值不能进入领域类型',
      ],
      [
        '只读是浅层类型约束',
        'Readonly<{ lines: Line[] }> 只阻止 order.lines 重新绑定，line.price 和 lines.push 仍可修改；需要同时使用 readonly Line[] 或 ReadonlyArray<Line>，运行时是否冻结另算。类型层 readonly 可以兼容包含可变成员的值，不能证明第三方没有修改引用。失败边界是把外部数组直接挂到实体上；验证动作是函数内尝试 push 被 tsc 拒绝，再尝试修改元素确认类型是否覆盖。',
        '只读要沿嵌套引用逐层声明',
      ],
      [
        '实体测试围绕身份与不变式',
        '测试应覆盖同 id 不同快照仍表示同一实体、不同 id 同字段表示不同实体、非法值对象构造失败、品牌解析拒绝错误前缀，以及实体更新后原对象不变。不要让测试依赖对象引用相等来表达领域身份。失败边界是测试只比较实现字段而遗漏状态合法性；验证动作是把 id 生成器替换成固定值，确认身份断言仍可解释。',
        '身份、合法性与更新一起验收',
      ],
    ],
  },
  {
    name: tsName(t2Stage, '判别联合与状态机'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能使用字面量联合、判别字段和穷尽 switch。',
    goal: '能把订单状态及其载荷建成判别联合，用类型化迁移表限制合法转换，并让每个状态只暴露有意义的操作。',
    guidedPractice: '定义 OrderState = { kind: "draft" } | { kind: "submitted"; submittedAt: Date } | { kind: "paid"; paidAt: Date; paymentId: string } | { kind: "cancelled"; reason: string }，为每种状态写 render 分支，再添加一个状态观察默认分支是否编译失败。',
    independentPractice: '实现 transition(state, command) 的纯函数版本，支持 draft 到 submitted、submitted 到 paid 或 cancelled，其他组合返回非法迁移错误；用状态与命令的笛卡尔积样例验证所有分支。',
    commonErrors: [
      '用一个 status 字符串加多个可选字段表示状态，导致 paid 状态仍可能没有 paidAt。',
      '在迁移函数里直接修改原 state，调用后旧快照被悄悄污染。',
    ],
    sourceRefs: [TS_NARROWING, TS_DOCS, TS_HANDBOOK],
    steps: [
      [
        '每个状态携带合法载荷',
        '判别联合把共同字段 kind 作为标签，只有 paid 分支拥有 paymentId，只有 cancelled 分支拥有 reason。switch (state.kind) 后检查器根据标签缩小成员，访问 state.paidAt 不需要 as。失败边界是用可选字段模拟互斥状态；验证动作是构造 paid 时故意漏掉 paidAt，确认对象字面量直接报错。',
        '状态标签与载荷要同时变化',
      ],
      [
        '迁移表表达允许关系',
        '可定义 type Transitions = { readonly draft: "submitted"; readonly submitted: "paid" | "cancelled"; readonly paid: never; readonly cancelled: never }，再用 satisfies 检查表项与状态键一致。具体迁移函数仍接收 state 与 command，并在进入目标状态时补充目标载荷。失败边界是表只覆盖类型却没有运行时权限、版本或幂等判断；验证动作是把每条允许和禁止边都写入测试表。',
        '类型表描述图而不是执行图',
      ],
      [
        '命令携带目标状态所需数据',
        '命令也应是判别联合，例如 { type: "submit" }、{ type: "pay"; paymentId: string }、{ type: "cancel"; reason: string }。在 transition 中先按 from 与 command type 判断，再构造新状态；不能从宽 command 中直接读取未收窄的 paymentId。失败边界是命令载荷在校验前被信任；验证动作是让非法命令与当前状态组合命中错误分支。',
        '命令输入也要按判别分支校验',
      ],
      [
        '纯迁移返回新快照',
        'transition 接收只读 state，返回 Result<OrderState, TransitionError>，成功时使用对象字面量构造目标状态，失败时返回 from、command 与 errorCode。不要在内部 push 事件或修改外部时间，时间与 id 作为参数注入。失败边界是同一命令执行两次产生不同结果却没有幂等键；验证动作是深度比较调用前后 state，并断言副作用在调用方完成。',
        '迁移只计算下一状态',
      ],
      [
        '状态机样例覆盖边与非法边',
        '测试至少覆盖每个允许边的目标载荷、每个禁止边返回稳定错误码、终态没有出边，以及旧快照保持不变。使用磁盘上显式样例表帮助审阅业务规则，不要只依赖随机生成。失败边界是新增状态后测试仍绿却漏了迁移；验证动作是让 Transitions 使用 Record 建立完整键集，并运行 tsc 与 Vitest。',
        '规则表与测试样例要同步增长',
      ],
    ],
  },
  {
    name: tsName(t2Stage, '只读结构、不可变更新与差异'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解展开运算符、数组方法，并能读写嵌套对象类型。',
    goal: '能用类型和更新函数维持结构共享，区分浅只读、深只读与运行时冻结，并为嵌套集合实现可验证的替换和差异计算。',
    guidedPractice: '从一个 Readonly<Order> 中替换第二个 line 的数量，分别尝试直接赋值、原地修改数组和对象展开；记录 tsc 拒绝的语句，再写 Object.freeze 对顶层与嵌套对象做运行时写入实验。',
    independentPractice: '实现 updateLineQuantity(order, lineId, quantity)，要求原 order 完全不变、只替换目标行并保留其他数组引用；再写 collectChangedLineIds 比较前后快照并测试不存在行与相同值。',
    commonErrors: [
      '以为 Readonly<T> 会递归冻结所有嵌套字段。',
      '使用 JSON 序列化深拷贝，顺便丢失 Date、undefined 和类实例原型。',
    ],
    sourceRefs: [TS_DOCS, TS_HANDBOOK, MDN],
    steps: [
      [
        '浅只读与深只读',
        'Readonly<T> 只让 T 的顶层属性不可重新赋值，属性若指向数组或对象，其内部仍可变；DeepReadonly<T> 可通过映射类型递归，但函数、Date、Map 和循环引用需要特殊处理。类型系统只检查写入语法，不能让外部库停止修改同一引用。失败边界是把第三方对象整体断言成 DeepReadonly；验证动作是运行真实 mutation 测试并检查是否冻结。',
        '只读深度要按数据结构定义',
      ],
      [
        '对象展开与结构共享',
        '更新 order.lines[index] 时，先复制 lines 数组，再复制目标 line，最后复制 order；未改变的 line 对象继续共享引用。表达式可写成 { ...order, lines: order.lines.map(line => line.id === next.id ? next : line) }。失败边界是每一层都深拷贝，性能和身份语义一起退化；验证动作是断言未变行保持 ===，目标行得到新引用。',
        '复制变化路径，共享未变部分',
      ],
      [
        '只读数组的更新函数',
        '参数使用 readonly Line[] 能阻止函数内 push 和 splice，返回类型也用 readonly Line[]；需要增删时生成新数组而不是修改入参。泛型函数 replaceById<T extends { readonly id: string }>(items: readonly T[], next: T): readonly T[] 可保留元素类型。失败边界是返回同一个数组却声称已经更新；验证动作是检查目标元素、数组引用和旧快照。',
        '集合更新由输入输出类型共同约束',
      ],
      [
        '嵌套更新建立领域动作',
        '不要在每个调用点手写四层展开，提供 updateLineQuantity 这样的领域函数，内部验证行存在、数量范围与订单状态，再走统一复制路径。函数返回 Result 可区分找不到行与非法数量。失败边界是辅助函数只接受 any 并丢掉 Order 类型；验证动作是给函数签名保留 Order 与 LineId，并让 expect-type 检查返回值。',
        '复杂展开封装成领域操作',
      ],
      [
        '差异与克隆的语义边界',
        '比较前后快照时应按领域身份与字段生成 changed IDs，而不是依赖 JSON 字符串；JSON 会丢掉 undefined、把 Date 变字符串，也无法保留 Map。structuredClone 能复制更多内建对象，但不会保留普通类原型，且对函数直接失败。失败边界是差异算法把对象顺序变化当业务变化；验证动作是构造属性顺序不同但值相同的对象，并记录比较结果。',
        '克隆方式决定哪些语义能保留',
      ],
    ],
  },
  {
    name: tsName(t2Stage, '穷尽检查与 never 分支'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能写判别联合、switch 分支，并理解 never 是不可达值类型。',
    goal: '能用 never 证明分支覆盖完整，从运行时白名单派生联合类型，并利用 noUncheckedIndexedAccess 处理动态查找的缺失情况。',
    guidedPractice: '写 function assertNever(value: never): never { throw new Error(JSON.stringify(value)) }，在联合 switch 的 default 调用它；随后给联合增加一个新成员，确认 default 中的 value 不再是 never 并触发 tsc 错误。',
    independentPractice: '把权限动作写成 as const 数组并用 (typeof actions)[number] 得到联合；实现权限渲染函数，要求新增数组项后不补分支便类型检查失败，同时为未知字符串输入写运行时拒绝分支。',
    commonErrors: [
      'default 分支直接 throw new Error，不让参数保持 never，新增状态时无法得到编译提醒。',
      '只从手写 type 派生运行时数组，白名单与类型最终漂移。',
    ],
    sourceRefs: [TS_NARROWING, TS_DOCS, TS_HANDBOOK],
    steps: [
      [
        'never 是空值集合',
        'never 不包含任何成员，任何值都不能直接赋给它；函数若永不正常返回，可把返回类型写成 never。switch 覆盖所有联合成员后，剩余值会被分析成 never，这个空集正是穷尽证明。失败边界是把 any 传给 never 参数绕过检查；验证动作是临时增加联合成员并运行 tsc。',
        '穷尽来自剩余值变成空集',
      ],
      [
        'assertNever 收集遗漏',
        'function assertNever(value: never): never 可用于 default 分支，运行时如果外部数据绕过类型进来，可记录 JSON 后抛错；编译期新增成员时 default 参数变成新成员类型，调用报错。失败边界是把 default 写成永不执行的注释而不校验；验证动作是删掉一个 switch case，确认错误位置落在 default。',
        'default 同时服务编译与运行时',
      ],
      [
        '从 as const 数据派生联合',
        'const actions = ["read", "write", "invite"] as const 后，type Action = typeof actions[number] 得到三个字面量，运行时可用于 includes 白名单，类型层用于 switch。satisfies readonly string[] 可检查数组元素而保留字面量。失败边界是白名单 from API 被任意字符串覆盖；验证动作是让函数接收 string 时先做 includes 收窄。',
        '单一数据源同时供类型和校验',
      ],
      [
        '索引查找的缺失分支',
        '开启 noUncheckedIndexedAccess 后，Record<Action, Handler>[action] 仍可能被视为缺失，动态数组下标也变成 T | undefined。使用查找表前先检查 if (!handler)，或使用 Map 并显式处理 get 的 undefined。失败边界是用非空断言 handler! 换来运行时 TypeError；验证动作是删除一个键并运行对应请求。',
        '动态键要显式处理空结果',
      ],
      [
        '用类型测试锁定穷尽',
        '对外公开的状态联合应配 expect-type：验证合法状态可赋给 State，非法字符串被 @ts-expect-error 拒绝，以及 assertNever 接受完整联合后结果为 never。测试文件仍要参与 tsc，不能只被 Vitest 转译。失败边界是新增状态后只有运行时测试变红；验证动作是把类型测试加入独立 tsconfig，并在 CI 先执行 tsc。',
        '穷尽契约需要编译期回归',
      ],
    ],
  },
  {
    name: tsName(t2Stage, '权限、租户与品牌类型'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解品牌类型、判别联合，并能设计认证与授权的基本输入输出。',
    goal: '能用不透明品牌区分租户、用户和资源 ID，用封闭权限联合表达策略输入，并确保品牌只在经过运行时校验后生成。',
    guidedPractice: '声明 unique symbol 品牌，分别定义 TenantId、UserId 与 DocumentId；写一个 authorize(subject, document, action) 并故意把 TenantId 传给 UserId 参数，记录 tsc 错误与运行时对象结构。',
    independentPractice: '为文档权限实现 read、write、admin 三种动作，策略函数要求 subject 与 document 同租户且有对应角色；为跨租户、越权角色和伪造 brand 三类输入写测试，并用 expect-type 锁定参数不可互换。',
    commonErrors: [
      '用 string 同时表示租户、用户和资源 ID，最终出现跨租户查询。',
      '在请求处理器里直接 as TenantId，而没有核对已认证会话中的租户。',
    ],
    sourceRefs: [TS_DOCS, TS_HANDBOOK, ECMA],
    steps: [
      [
        '不透明品牌隔离 ID 语义',
        'type TenantId = string & { readonly [tenantBrand]: "TenantId" } 与 UserId 使用不同品牌后，两个同为 string 的值在类型层不能互换。品牌只是编译期标记，JSON 序列化后仍是字符串。失败边界是把外部 header 直接断言成 TenantId；验证动作是搜索 as TenantId，只允许出现在解析与测试构造器中。',
        '同形字符串不代表同一种标识',
      ],
      [
        '租户与用户身份组合',
        'Subject 可定义为 Readonly<{ tenantId: TenantId; userId: UserId; roles: readonly Role[] }>，资源也带 tenantId。授权函数先检查 subject.tenantId === document.tenantId，再检查角色与动作，比较时应使用解析后的品牌值。失败边界是从请求体接收 tenantId 覆盖会话租户；验证动作是构造同 id 字符串但不同来源的数据，记录授权决策。',
        '租户边界必须由可信会话决定',
      ],
      [
        '权限用封闭联合表达',
        'type DocumentAction = "read" | "write" | "admin"，策略表用 satisfies Record<DocumentAction, readonly Role[]> 检查覆盖。未知字符串先经过运行时白名单收窄，不能从 API 直接断言成 DocumentAction。失败边界是新增动作后策略表漏项却仍可运行；验证动作是添加一个临时动作并运行 tsc，再移除。',
        '权限列表需要单一封闭来源',
      ],
      [
        '品牌生成与恢复的边界',
        'parseTenantId(value: unknown): Result<TenantId> 先确认 string、长度与允许字符，再返回品牌值；持久化层读取时同样走 parse，不能因为数据库字段历史可信就跳过。日志与错误输出要使用脱敏后的字符串，不把完整品牌值当安全凭据。失败边界是反序列化函数内部 as 后没有版本检查；验证动作是对 null、超长字符串与旧版本前缀做测试。',
        '品牌是校验结果的证明',
      ],
      [
        '类型隔离与运行时授权同时验收',
        '类型测试证明 TenantId 与 UserId 不能互换、非法动作无法传入策略；运行时测试证明跨租户被拒绝、角色不足被拒绝、合法请求通过。两条证据缺一不可。失败边界是只靠类型系统授权，因为 any、JSON 和外部客户端都能绕过；验证动作是给授权入口注入 unknown 并使用真实解析，再执行测试矩阵。',
        '静态标识不能替代运行时授权',
      ],
    ],
  },
  {
    name: tsName(t2Stage, '领域类型重构实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '完成值对象、状态机、不可变更新与品牌类型练习，能运行项目测试和 tsc。',
    goal: '能把一个 any 与可选字段混杂的订单模块重构为类型驱动模型，同时保留外部 DTO 兼容、运行时解析和可回滚迁移步骤。',
    guidedPractice: '选择一个小型订单对象，记录所有 string、boolean 和可选字段的来源；把支付状态与取消原因改成判别联合，把 userId 改成品牌类型，再逐步修复 tsc 报错而不是先加 as。',
    independentPractice: '为重构前 DTO 写兼容解析器，把旧字段映射到新领域模型；保留一份未改消费者测试和一份新消费者测试，确认发布后两类调用都能读取，最后写出后续删除旧 DTO 的条件。',
    commonErrors: [
      '一次性把所有模块改成新模型，导致无法区分业务错误与迁移错误。',
      '为了快速消除重构报错批量添加 as 和 any，破坏原本要建立的类型边界。',
    ],
    sourceRefs: [TS_DOCS, TS_HANDBOOK, TS_DECLARATION],
    steps: [
      [
        '盘点 any、断言与可选字段',
        '先用 rg 搜索 any、as Order、Record<string, any> 和可能并存的状态字段，给每个位置标出来源、是否在 I/O 边界、是否有运行时验证。重构顺序从最外层 DTO 向内推进，避免旧数据直接进入新模型。失败边界是把断言数量下降当作唯一指标；验证动作是统计每个 any 替换成 unknown、具体类型或解析器的位置。',
        '先画出不可信输入的入口',
      ],
      [
        '用构造器建立领域不变式',
        '把金额、标识符和订单状态各自封装成构造函数，所有校验在入口返回 Result；内部函数只接收已构造类型。错误应带 field、code 和原始路径，不能把所有失败压成通用字符串。失败边界是构造器只检查类型却不检查业务范围；验证动作是对负数、NaN、缺失租户和非法状态各写一条失败用例。',
        '合法对象从构造时就成立',
      ],
      [
        '把状态与命令拆开',
        '订单状态使用判别联合，命令使用另一组联合，迁移函数返回新状态与事件列表。事件记录旧状态、新状态、操作者和时间，便于审计。失败边界是事件与当前状态重复存储且没有一致性校验；验证动作是重放同一事件序列并比较最终状态。',
        '状态快照与变化记录各存其责',
      ],
      [
        '旧 DTO 到新模型用适配器',
        'legacyToOrder(raw: unknown): Result<Order> 解析旧字段，把字符串状态和白名单字段映射到新联合，无法识别的旧值返回明确错误。适配器只出现在仓储和 API 边界，领域层不导入旧 DTO。失败边界是适配器把未知状态默认成 draft，导致业务语义被改写；验证动作是用历史样例集运行并统计拒绝原因。',
        '迁移层只做显式转换',
      ],
      [
        '发布前验证类型与行为',
        '重构验收至少包括 tsc、领域单元测试、旧 DTO 兼容测试、生成声明差异和一次回滚演练。检查公开导出是否减少、常见错误信息是否可读、消费者是否仍能构造旧参数。失败边界是测试只覆盖新入口；验证动作是保留一个旧调用样例编译并运行，确认迁移期兼容。',
        '新模型要能穿过旧消费者场景',
      ],
    ],
  },
];

const t3Stage = 'API 契约、运行时校验与错误模型';

const TYPESCRIPT_T3_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: tsName(t3Stage, '请求、响应与领域类型分离'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能定义 DTO 与领域对象，知道 JSON 只支持字符串、数字、布尔、数组、对象和 null。',
    goal: '能把网络 DTO、领域模型和响应投影分成三层，处理 null、缺失字段、日期和精确标识符，避免静态类型直接冒充运行时解析。',
    guidedPractice: '为一个用户接口分别写 UserDto、User 与 UserResponse：DTO 用 string 日期和 nullable 字段，领域对象用 Date 与品牌 UserId，Response 只含公开字段；用 mapping 函数连接三层，并打印每个字段的转换。',
    independentPractice: '改造一个直接返回数据库实体的端点，引入 RequestDto、DomainCommand 与 PublicResponse，删除密码哈希和内部版本字段；用旧客户端样例与恶意额外字段验证输出。',
    commonErrors: [
      '把数据库实体直接当 API 响应，新增内部字段后自动泄漏给客户端。',
      '用同一接口同时表示请求、响应和领域对象，可选字段语义在各层不断冲突。',
    ],
    sourceRefs: [OPENAPI, TS_DOCS, ZOD],
    steps: [
      [
        'DTO 只描述线上形状',
        'JSON 没有 Date 和品牌类型，网络 DTO 应使用 string、number、boolean、null 等可传输形状。可选属性与 null 也要分开：exactOptionalPropertyTypes 下 displayName?: string 表示键可以不存在，displayName: string | null 表示键存在但无值。失败边界是把 null 当成缺省值后在数据库写空字符串；验证动作是分别发送缺键和显式 null，保存解析结果。',
        '线上形状与领域含义分层',
      ],
      [
        '解析后显式构造领域对象',
        'toUser(dto: UserDto): Result<User> 逐字段验证并构造新对象，不写 { ...dto } as User，因为展开会保留未知字段并把字符串日期当 Date。解析器负责 trim、长度、枚举和标识符格式，领域层不再重复。失败边界是只有类型转换没有业务校验；验证动作是对多余字段、错误日期和空字符串运行测试。',
        '转换过程必须生成新契约',
      ],
      [
        '日期、金额与标识符转域',
        'WireOrder 中 createdAt 是 ISO 字符串、amount 是整数分、customerId 是 string；领域 Order 使用 Date、整数分配合货币或专用 Money、品牌 CustomerId。映射时检查 Number.isSafeInteger、allowNegative 与 Date.parse 结果，金额格式化只发生在展示层。失败边界是用 Number 浮点直接做货币运算；验证动作是对大整数、负零和非法日期记录结果。',
        '传输表示不能替代领域表示',
      ],
      [
        '请求与响应各有兼容方向',
        '请求新增必填字段会打断旧客户端，响应新增必填字段会打断旧消费者；通常先让服务端接受可选请求，再按版本提升必填，响应只追加可选字段。响应投影要固定字段列表，避免把实体展开。失败边界是请求和响应共用一个 DTO 后无法独立演进；验证动作是用新服务端运行旧客户端契约样例。',
        '两端兼容规则并不对称',
      ],
      [
        '用边界夹具证明三层分离',
        '夹具至少包含正常对象、null、缺键、未知额外字段、错误日期和超长字符串；对每个夹具记录 DTO 解析、领域构造与响应输出三个阶段。类型测试确认 PublicResponse 不含内部字段，运行时测试确认拒绝路径。失败边界是夹具只覆盖正常 JSON；验证动作是把同一夹具同时送入解析器与旧实现对照。',
        '三层契约要用同一组输入验收',
      ],
    ],
  },
  {
    name: tsName(t3Stage, 'Zod/Valibot 运行时解析'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能使用 TypeScript 泛型，理解 JSON 数据在运行时没有类型保证。',
    goal: '能用 Zod 或 Valibot 把外部 unknown 解析成可信值，读取结构化错误路径，区分 coerce、transform 与业务校验，并让 schema 与静态类型同步。',
    guidedPractice: '用 z.object({ id: z.string().uuid(), role: z.enum(["reader", "editor"]) }).strict() 定义 UserSchema，运行 schema.safeParse 对合法、缺字段、额外字段和错误枚举四组数据，并打印 issues 的 path、code 与 message。',
    independentPractice: '为订单解析写带判别联合的 schema，要求支付分支必须有 paymentId，取消分支必须有 reason；用 refine 检查跨字段规则，并写正反例验证 schema 输出可赋给领域命令类型。',
    commonErrors: [
      '只写 z.infer 类型而不调用 parse，继续把 any 或 JSON.parse 结果当可信对象。',
      '把字符串转数字的 coerce 用在所有字段，导致空字符串悄悄变成 0。',
    ],
    sourceRefs: [ZOD, TS_DOCS, OPENAPI],
    steps: [
      [
        'schema 是运行时事实来源',
        'const UserSchema = z.object({ id: z.string().uuid(), role: z.enum(["reader", "editor"]) }) 同时提供 parse 与 z.infer<typeof UserSchema>；类型不可手写一份再让 schema 漂移。Unknown 输入先进入 safeParse，success 为 true 后才能使用 data。失败边界是编译通过但运行时字段缺失；验证动作是 import schema 直接解析 JSON，而不经过 as。',
        '类型与解析规则应由同一 schema 产生',
      ],
      [
        'safeParse 与错误路径',
        'safeParse 返回 success 判别联合，失败时 error.issues 包含 path、code 和 message，可映射成字段级 422 响应；parse 在失败时抛 ZodError，适合已被外层错误边界处理的内部边界。不要把整段 issues 原样暴露给用户，应保留 code 与安全文案。失败边界是只返回首个错误导致表单无法定位全部字段；验证动作是构造两个字段同时非法的输入。',
        '结构化错误按字段回传',
      ],
      [
        'coerce、transform 与 refine',
        'z.coerce.number 会先转换再校验，空字符串可能变成 0，因此分页参数应先用 z.string().regex 再 transform，或明确预设默认值；transform 适合无损归一化，refine 适合跨字段业务规则。所有变换都应在输出类型中体现。失败边界是 transform 抛出的异常没有路径；验证动作是对空字符串、超出范围和两个字段冲突分别记录 issue。',
        '转换步骤本身就包含业务风险',
      ],
      [
        '判别联合与跨字段约束',
        'schema 可用 z.discriminatedUnion("kind", [...]) 校验每个分支的独占字段，再对支付金额与取消原因做 refine。若 schema 输出与领域判别联合同名不同结构，应显式 toDomain 映射。失败边界是联合分支共享可选字段导致任何状态都能通过；验证动作是构造缺少分支载荷和同时携带两套载荷的对象。',
        '分支契约必须互斥且完整',
      ],
      [
        '版本、严格性与依赖升级',
        '固定 Zod/Valibot 版本，审阅 strict、passthrough 与 strip 的差异，决定未知字段是拒绝还是丢弃；升级后对历史样例重跑 schema 测试。strict 阻止额外字段进入，strip 可以兼容旧客户端但会静默丢弃。失败边界是升级后错误路径或类型推断改变却没有测试；验证动作是保存解析前后快照并比较 issue code。',
        '解析器版本也是契约的一部分',
      ],
    ],
  },
  {
    name: tsName(t3Stage, 'OpenAPI 契约与客户端生成'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能阅读 JSON Schema，理解 HTTP 状态码与请求响应结构。',
    goal: '能按 OpenAPI 3.1 写可生成客户端的契约，区分生成类型的编译保证与运行时验证，并用契约差异和消费者测试阻止漂移。',
    guidedPractice: '为 GET /users/{id} 写 OpenAPI 3.1 片段，使用 path parameter、200 响应、type ["string","null"] 与 required；运行 openapi-typescript 生成类型，故意删除 required 中一个字段，观察客户端访问该字段时的类型变化。',
    independentPractice: '为一个创建订单接口补 400、409、422 三类响应与错误 schema，生成客户端后用 mock server 运行成功和失败请求；再修改服务端字段名，要求契约检查或消费者测试变红。',
    commonErrors: [
      '在 OpenAPI 3.1 中继续写 nullable: true，而不使用 type 数组或 anyOf。',
      '认为生成的客户端类型会自动校验响应，实际只提供静态形状。',
    ],
    sourceRefs: [OPENAPI, TS_DOCS, TS_MODULES],
    steps: [
      [
        'OpenAPI 3.1 的可传输类型',
        '3.1 的 Schema Object 与 JSON Schema 更接近，字符串可空写 type: ["string", "null"]，联合写 anyOf，required 决定字段是否必须出现。日期时间用 format: date-time 表达字符串格式，不直接生成 Date。失败边界是 type: string 却附加 nullable: true，生成器会忽略非标准键；验证动作是通过 OpenAPI 校验器并查看生成类型。',
        '契约要使用目标版本的真实语法',
      ],
      [
        '生成类型与运行时校验分工',
        'openapi-typescript 等工具能从 spec 生成 request 与 response 类型，编译期可抓住字段拼写；但服务端可能返回旧版本或错误 JSON，客户端仍需用 schema 或解析器检查关键响应。失败边界是把 fetch<T> 当运行时保证；验证动作是 mock 一个缺字段响应，确认类型检查通过但解析器能拒绝。',
        '生成类型不能代替响应解析',
      ],
      [
        '契约优先的双向流程',
        '先改 OpenAPI，再生成客户端与测试夹具，服务端实现按同一 schema 运行契约测试。Fastify、NestJS 或 tRPC 可从代码生成 schema，但生成方向必须固定，避免手改生成文件。失败边界是 spec、生成物和服务端三份各自漂移；验证动作是 CI 重新生成后检查 git diff，并运行真实端点契约测试。',
        '单一契约源决定生成方向',
      ],
      [
        '识别破坏性契约变化',
        '删除字段、重命名、收紧枚举、把可选变必填、改变状态码或错误形状通常破坏消费者；新增可选响应字段、增加新端点、放宽输入限制相对安全。敏感变化还要考虑缓存与旧客户端。失败边界是只看 TypeScript 编译而忽略线上旧版本；验证动作是用至少两个历史客户端版本对 staging 发送请求。',
        '兼容性由消费者矩阵判定',
      ],
      [
        '把契约漂移纳入门禁',
        'CI 应执行 spec lint、生成客户端、diff 生成文件、运行契约测试和构造消费者编译，任何未提交的生成差异都失败。版本号与 changelog 要指向 spec 变更。失败边界是手工更新生成文件却没有记录 spec；验证动作是故意改 controller 响应字段并确认门禁报出具体 diff。',
        '生成差异必须成为审阅证据',
      ],
    ],
  },
  {
    name: tsName(t3Stage, '错误码、结果类型与异常边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能写判别联合和 switch，知道 Promise 拒绝与同步抛错都能被 catch 捕获。',
    goal: '能区分预期业务失败与意外异常，用稳定错误码和 Result 表达可恢复分支，在 catch 中处理 unknown 并保留 cause、请求标识与安全外泄边界。',
    guidedPractice: '定义 type ApiError = { code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT"; message: string; details?: unknown }，让三个端点返回 Result<Value, ApiError>；再在 catch (error: unknown) 中规范化为 INTERNAL 错误并打印 cause。',
    independentPractice: '为一个导入任务设计错误模型，区分校验失败、重复记录、权限拒绝和临时网络错误；给每类建 HTTP 映射、日志级别、可重试标记和用户文案，并用测试验证内部堆栈不会进入响应。',
    commonErrors: [
      '把所有失败都抛成 Error，调用方只能 catch 后看 message 做字符串判断。',
      'catch 参数写成 any 或直接返回 error.message，丢失错误类型与安全边界。',
    ],
    sourceRefs: [TS_DOCS, OPENAPI, ECMA],
    steps: [
      [
        '预期失败进入结果类型',
        '校验失败、未找到、业务冲突属于调用方应处理的预期分支，可返回 { ok: false; error: ApiError }；数据库断线、编程错误或不可恢复依赖故障可抛异常交给顶层边界。Result 让 if (result.ok) 收窄成功值，避免每个调用方猜测 message。失败边界是 Result 里再塞异常对象导致序列化不稳定；验证动作是检查错误分支是否只含 code、message 与安全 details。',
        '可恢复失败用值表达',
      ],
      [
        '错误码是稳定协议',
        '错误码使用封闭字符串联合，并由单一映射转成 HTTP、重试策略和用户文案；例如 CONFLICT 映射 409 且不可自动重试，DEPENDENCY_TIMEOUT 可标记可重试。message 可本地化，code 不应随文案改变。失败边界是新增错误码没有响应映射；验证动作是让 Record<ErrorCode, Mapping> 穷尽，并运行契约测试。',
        '错误码承担程序协议',
      ],
      [
        'catch unknown 与异常链',
        '使用 try/catch 时严格模式把 error 视为 unknown，先检查 error instanceof Error，再读取 name 与 message；第三方库可能抛出字符串。重新抛错时用 new Error("load failed", { cause: error }) 保留根因，但对外只返回 requestId 与通用文案。失败边界是日志打印完整数据库连接串；验证动作是构造 Error、字符串和对象三种抛出值。',
        '异常记录保留根因但隔离敏感信息',
      ],
      [
        '校验错误映射到字段路径',
        '运行时解析器返回 issues 后，转换为 { field, code, message }，不要把错误 library 的类名暴露给客户端。多个字段错误保留顺序，非字段错误进入 request 级 code。失败边界是把原始输入回显到错误 message；验证动作是发送含脚本标签与超长字段并检查响应。',
        '错误详情也要经过输出投影',
      ],
      [
        'Result 分支穷尽与请求关联',
        '调用方 switch (error.code) 或用 assertNever 检查所有业务错误；每个响应带 requestId，日志用同一 id 关联入参摘要、错误码与耗时。重试只针对明确可重试且幂等的操作。失败边界是新增错误码后 UI 显示空白；验证动作是加入临时 code，让穷尽检查失败，再补 UI 与测试。',
        '可恢复分支需要客户端穷尽处理',
      ],
    ],
  },
  {
    name: tsName(t3Stage, '版本兼容与弃用策略'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解语义化版本、API 契约和 TypeScript 的 JSDoc 弃用提示。',
    goal: '能为类型与 API 区分兼容变更和破坏变更，用 @deprecated、运行时头和迁移期双实现安排弃用，并以消费者版本矩阵决定何时删除。',
    guidedPractice: '在导出函数上写 @deprecated JSDoc，说明替代 API 与计划移除版本，观察编辑器删除线；再为 HTTP 响应增加 Deprecation 与 Sunset 头，编写旧调用和新调用两套消费者测试。',
    independentPractice: '为一个旧字段设计六周迁移：双写兼容、统计调用、文档提示、运行时告警、灰度关闭和最终删除；为每个阶段定义进入与回滚条件。',
    commonErrors: [
      '新增必填字段却只升补丁版本，声称是向后兼容。',
      '只在文档写弃用，没有运行时观测与消费者迁移证据就直接删除 API。',
    ],
    sourceRefs: [TS_DOCS, OPENAPI, NODE_PACKAGES],
    steps: [
      [
        '按消费者影响分类版本',
        '新增可选输入、增加新端点通常兼容；删除导出、改参数类型、收紧枚举、改变默认值可能破坏 TypeScript 或运行时消费者。semver 主版本应承载破坏变更，但内部库也要考虑消费者锁定策略。失败边界是类型兼容但序列化格式改变；验证动作是同时比较 .d.ts diff、生成的 OpenAPI diff 与运行时夹具。',
        '版本判断覆盖类型和线协议',
      ],
      [
        'JSDoc 弃用提供编译器提示',
        '在旧导出上写 /** @deprecated Use createOrderV2; removal planned in 3.0. */ 并保留准确替代说明，编辑器会显示删除线，API Extractor 也能把弃用写入声明。不要删除参数或改变行为来“提醒”调用者。失败边界是所有内部调用仍使用旧 API 却没有追踪；验证动作是生成声明并搜索 deprecated 标记。',
        '声明层弃用要指向替代路径',
      ],
      [
        '运行时弃用需要观测',
        'HTTP 可用 Deprecation 与 Sunset 头，库可记录 usage 指标或开发模式告警，但日志必须节流并隐藏敏感参数。为每个消费者记录调用版本、端点和截止日期，达到阈值后才允许下线。失败边界是只发一次公告就无数据；验证动作是构造旧客户端请求并确认指标可查询。',
        '弃用期由真实调用证据驱动',
      ],
      [
        '迁移期提供双路径',
        '旧入口可内部委托到新实现，统一参数校验与错误码，避免两套业务逻辑分叉；新入口保持清晰签名。返回字段需要并存时，明确默认值和删除条件。失败边界是双实现逐渐行为不一致；验证动作是同一组契约夹具同时跑旧新入口并比较关键输出。',
        '兼容层应尽量薄且共享实现',
      ],
      [
        '删除前完成消费者矩阵',
        '删除 API 前运行当前版本、最近两个主版本和关键内部消费者测试，确认新入口覆盖能力、迁移文档可执行、回滚包可获取。失败边界是只测试仓库内部调用；验证动作是发布候选包到隔离 registry，构建外部样例并执行真实导入。',
        '删除权限来自消费者迁移完成',
      ],
    ],
  },
  {
    name: tsName(t3Stage, '不可信输入端到端实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '完成 DTO 分离、运行时解析、OpenAPI 和错误模型课程，能编写集成测试。',
    goal: '能从 HTTP 字节流到领域结果走通一条不可信输入链，依次处理大小、内容类型、Schema、业务授权、领域转换和错误输出。',
    guidedPractice: '为 POST /orders 接收 unknown body，先检查 Content-Type 与大小，再用 schema 解析 DTO，随后检查租户和商品权限，最后构造领域订单；为每一步打印稳定错误码与 requestId。',
    independentPractice: '独立实现端点与四组攻击样例：超长 JSON、未知字段、跨租户商品和伪造金额；要求全部在产生副作用前被拒绝，并验证日志中不含完整令牌与信用卡字段。',
    commonErrors: [
      '先写数据库、再验证字段，导致非法请求留下半成品订单。',
      '把验证库的原始错误和请求体原样返回，泄漏内部字段与实现信息。',
    ],
    sourceRefs: [OPENAPI, ZOD, TS_DOCS],
    steps: [
      [
        '请求进入后先限制体积',
        'HTTP 层应在读取完整 JSON 前限制 Content-Length、流式字节数和超时，并用 content-type 判断是否走 JSON 解析；这些动作早于 TypeScript 类型。失败边界是框架已把超大 body 读入内存后才校验字段；验证动作是发送超过阈值的请求，确认连接被关闭且有 requestId 日志。',
        '运行时边界从协议约束开始',
      ],
      [
        'Schema 只负责结构可信',
        'safeParse 检查字段、类型、长度、枚举和判别联合，成功后得到 DTO；它不知道租户是否有权购买该商品，也不应该调用数据库。失败边界是把授权放进 schema 后难以测试和复用；验证动作是让结构正确但权限错误的请求进入下一层，并返回 AUTHORIZATION 错误。',
        '结构校验与业务授权分层',
      ],
      [
        '领域转换与副作用分离',
        'DTO 经过业务规则转换为 CreateOrderCommand，再在事务中写入数据库；金额从客户端字符串解析为整数分后重新计算权威总价，不信任客户端 total。失败边界是先创建订单再计算价格；验证动作是注入价格变化和重复提交，确认事务与幂等行为。',
        '写入前完成权威业务判断',
      ],
      [
        '输出投影与错误脱敏',
        '成功响应只从新订单投影公开字段，错误响应只含 code、message、requestId 与安全 field 路径；不返回堆栈、SQL、令牌或完整输入。失败边界是统一错误处理器把 Error 直接 JSON 化；验证动作是触发数据库错误并扫描响应与日志中的敏感模式。',
        '成功和失败都经过输出契约',
      ],
      [
        '端到端样例与运行时证据',
        '测试矩阵覆盖正常请求、边界长度、缺字段、额外字段、非法枚举、跨租户、重复幂等键和依赖失败；每项断言 HTTP 状态、error code、数据库行数与日志字段。类型测试再检查 DTO、命令和响应不能互换。失败边界是只测 validator 不测真实路由；验证动作是用 supertest 或 Playwright APIRequest 调真实应用。',
        '输入安全必须由端到端证据收口',
      ],
    ],
  },
];

const t4Stage = '测试、声明文件与迁移';

const TYPESCRIPT_T4_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: tsName(t4Stage, '单元测试中的类型断言与边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能写 Vitest 单元测试，并知道 tsc 与测试运行器是两个独立命令。',
    goal: '能区分运行时断言与编译期类型断言，用 expectTypeOf 和 @ts-expect-error 验证函数签名，并让类型测试真正进入 CI。',
    guidedPractice: '为一个 parsePort(input: string): number | null 函数写正常、空字符串和越界三组运行时测试；再加 expectTypeOf(parsePort).returns.toEqualTypeOf<number | null>()，运行 Vitest 与 tsc --noEmit 观察两者各自负责什么。',
    independentPractice: '为 Result 泛型函数写四条类型用例：成功值、错误值、缺少判别字段和错误泛型参数；要求非法调用使用 @ts-expect-error，并确保删除任意一行错误抑制后 tsc 会失败。',
    commonErrors: [
      '测试只调用函数并通过 Vitest，就认为返回类型也被验证了。',
      '使用 @ts-ignore 隐藏错误，而不是用 @ts-expect-error 证明非法调用确实报错。',
    ],
    sourceRefs: [TS_HANDBOOK, TS_DOCS, EXPECT_TYPE],
    steps: [
      [
        '运行时测试与类型测试分工',
        'Vitest 执行业务代码并检查值，tsc 只分析源码形状；一个函数可以在所有 Vitest 用例中通过，同时返回类型被错误声明成 any。类型测试应放在参与 tsc include 的文件中，CI 同时运行 vitest 与 tsc --noEmit，任一失败都阻断。失败边界是测试配置启用了 transpileOnly 却不补类型检查；验证动作是故意把返回类型改错，确认 tsc 变红。',
        '执行正确与签名正确是两类证据',
      ],
      [
        'expectTypeOf 锁定函数签名',
        'Vitest 的 expectTypeOf 在类型层比较参数与返回类型，运行时通常没有实际断言代码；expectTypeOf(parser).parameter(0).toEqualTypeOf<string>() 和 returns.toEqualTypeOf<Result>() 能抓住签名漂移。失败边界是把具体值测试写成类型测试；验证动作是同时修改实现返回值与声明，检查哪个测试先失败。',
        '公共签名需要独立回归',
      ],
      [
        '@ts-expect-error 证明拒绝',
        '在非法调用上一行写 @ts-expect-error 后，该行若没有类型错误反而会导致编译失败；@ts-ignore 则会无条件吞掉错误。测试错误码时可配合错误消息片段，但不要过度绑定易变文案。失败边界是升级 TypeScript 后错误位置移动；验证动作是修复业务后删除抑制并确认原本的错误消失。',
        '负面类型测试要能随修复变红',
      ],
      [
        '夹具同时覆盖静态与动态输入',
        '把外部 JSON 夹具声明成 unknown，再经过解析器进入强类型分支；不要为了 TypeScript 方便把夹具直接 as Result。运行时断言检查输出值，类型断言检查解析器签名和分支字段。失败边界是夹具类型过宽让错误实现也能通过；验证动作是删掉一个必填字段，确认运行时与类型层各自给出预期结果。',
        '夹具应保留输入噪声',
      ],
      [
        '把类型测试接入质量门禁',
        'package.json 可设 typecheck: "tsc --noEmit"、test: "vitest run"，CI 顺序先安装固定依赖再运行两者；类型测试文件使用 .test-d.ts 或显式 tsconfig 时，要确认 include 覆盖。失败边界是类型测试只在编辑器可见；验证动作是在 CI 日志中搜索 tsc 命令与测试文件路径。',
        '未进入 tsc 的类型测试没有门禁价值',
      ],
    ],
  },
  {
    name: tsName(t4Stage, 'expect-type 与公开 API 类型测试'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '完成基本类型测试，能区分内部实现类型与包导出类型。',
    goal: '能用 expect-type 对外部消费者可见的声明做正向和负向断言，验证判别联合、泛型推断与默认参数，避免测试内部私有类型。',
    guidedPractice: '从包的 index 导出 parseUser，在 type-tests/public-api.ts 中导入并使用 expectTypeOf 检查返回类型的 ok 分支、错误码联合与参数接收范围；把测试文件移出 tsconfig include 后确认 tsc 不再检查它。',
    independentPractice: '为一个事件注册 SDK 写类型测试，覆盖合法事件与载荷、非法事件名、默认错误类型和自定义错误类型；再构建打包产物，用独立消费者工程重新运行同一组断言。',
    commonErrors: [
      '类型测试直接导入 src/internal.ts，却从未验证 package exports 暴露的入口。',
      '只做正向赋值测试，没有证明非法字段和错误泛型会被拒绝。',
    ],
    sourceRefs: [EXPECT_TYPE, TS_DECLARATION, TS_MODULES],
    steps: [
      [
        '类型测试从公开入口导入',
        '测试文件应写 import { register } from "@scope/pkg"，而不是跨目录导入内部实现；这样 path aliases、exports 条件和声明产物都参与真实解析。内部类型测试可以保留，但不能替代公开入口。失败边界是 tsconfig paths 恰好绕过包入口；验证动作是在独立消费者的 node_modules 中运行同一测试。',
        '测试路径决定契约是否真实',
      ],
      [
        '正向断言检查推断精度',
        'expectTypeOf(register).parameter(0).toEqualTypeOf<EventName>() 可发现公开签名退化成 string；对返回类型使用 toMatchTypeOf 可允许更具体结构，但关键字段应精确比较。泛型函数还要验证保留输入形状，而非只验证结果为 object。失败边界是 any 让所有断言同时通过；验证动作是禁止 any 泄漏并在测试中做类型相等检查。',
        '类型测试要防止宽化',
      ],
      [
        '负向断言验证拒绝范围',
        '使用 expectTypeOf(value).not.toBeAssignableTo<T>() 或 @ts-expect-error 验证非法事件、错误默认泛型和禁用字段确实不可传入。负向断言过宽会锁死无关行为，应绑定公共契约。失败边界是测试依赖内部错误消息；验证动作是升级编译器后重跑并检查失败是否来自业务拒绝。',
        '只证明能调用不足以定义边界',
      ],
      [
        '独立 tsconfig 管理声明测试',
        '可建立 tsconfig.type-tests.json，extends 主配置，include 只含 type-tests 与必要的 .d.ts，并设置 noEmit；主构建不必把 expect-type 依赖带进产物。若测试公开包入口，还要先构建声明文件再运行。失败边界是 type-tests 没有被 CI 脚本调用；验证动作是故意改坏一个公共导出并确认门禁捕获。',
        '类型测试配置也要被测试',
      ],
      [
        '构建前后各验证一次',
        '开发期源码类型测试能快速反馈，发布前必须对 tarball 或 dist 中的 .d.ts 再跑消费者测试，因为 declaration emit 可能泄漏私有符号或改变导出形状。失败边界是源码测试通过而打包后声明缺失；验证动作是 pnpm pack 后安装到临时消费者并运行 tsc。',
        '源码契约与发布契约分开验收',
      ],
    ],
  },
  {
    name: tsName(t4Stage, 'd.ts、declare 与第三方模块'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解模块导入导出，能阅读 package.json 的 types 与 exports 字段。',
    goal: '能区分声明文件与实现文件，正确编写模块声明和模块增强，解释 typeRoots、types 与 package 类型入口的解析顺序，并验证第三方类型缺失的真实原因。',
    guidedPractice: '为一个无类型 CommonJS 包创建 types/legacy/index.d.ts，用 declare module 写导出函数；再在 app-env.d.ts 中声明一个环境变量 interface，运行 npx tsc --showConfig 检查 types 与 typeRoots。',
    independentPractice: '排查一个 Cannot find declaration file 错误，分别检查包内 types 字段、exports 的 types 条件、@types 包和本地声明；选择一个最小修复，并写消费者工程证明 IDE 与 tsc 都能跳转。',
    commonErrors: [
      '把 .d.ts 当成会自动生成运行时代码的文件，或把 declare 当成实际赋值。',
      '第三方包已有类型时仍用 declare module 覆盖成 any，掩盖真实 API。',
    ],
    sourceRefs: [TS_DECLARATION, TS_MODULES, TS_CONFIG],
    steps: [
      [
        '声明文件与实现文件',
        '.d.ts 只描述类型与导出形状，没有可执行实现；declare const、declare function 和 interface 只向检查器声明存在。实现包通常由 tsc declaration: true 从 .ts 生成 .d.ts，手写声明主要用于无类型依赖或环境接口。失败边界是声明正确但运行时包没有该导出；验证动作是同时运行 tsc 和 node import。',
        '声明告诉检查器有什么',
      ],
      [
        '模块声明与模块增强',
        '外部模块 .d.ts 使用 export function parse(...) 描述一个模块；模块增强先用 import type 引入目标，再在 declare module "target" 中重复 interface，向已有模块补充成员。若目标不是模块，declare 会创建环境声明而不是增强。失败边界是用增强替代完整形状导致私有成员丢失；验证动作是引入增强前后各跑一次消费者 tsc。',
        '增强必须建立在已存在模块上',
      ],
      [
        '类型根目录与自动加载',
        'typeRoots 指定 @types 包的搜索根，types 只控制哪些全局声明被自动加载；包内 types 或 exports.types 负责该包自己的入口。二者不是同一条解析链。失败边界是设置 types: [] 后误以为所有依赖类型都消失；验证动作是检查 showConfig 并导入具体包确认模块声明仍可解析。',
        '全局类型与包类型来源不同',
      ],
      [
        '缺失声明的诊断顺序',
        '遇到第三方类型错误，先看错误码与模块解析 trace：运行 tsc --traceResolution 查找 package.json、index.d.ts、exports 与 @types 候选。仅在包确实无类型时写最小本地声明，并把版本与来源记录清楚。失败边界是用 declare module "pkg" 返回 any 掩埋所有调用错误；验证动作是补一个错误参数调用，确保声明仍能检查公开 API。',
        '声明缺口必须定位到解析链',
      ],
      [
        '生成声明与消费者验收',
        '公开库开启 declaration: true 后检查 .d.ts 是否引用私有路径、是否带 declarationMap、是否在 package exports 的 types 条件可达。失败边界是源码能 import 但发布包无法解析类型；验证动作是 pnpm pack，解压 tarball 检查文件，并在隔离工程运行 tsc。',
        '声明发布以 tarball 内容为准',
      ],
    ],
  },
  {
    name: tsName(t4Stage, 'allowJs、checkJs 与增量迁移'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '维护过 JavaScript 项目，能在 package.json 和 tsconfig 中调整编译选项。',
    goal: '能设计 JavaScript 到 strict TypeScript 的分批迁移，使用 allowJs、checkJs 与 JSDoc 获取早期反馈，并以文件清单和退出条件控制风险。',
    guidedPractice: '在小型 JS 项目把 allowJs 设为 true，先只跑 noEmit 观察语法与模块问题；再把 checkJs 打开，用 JSDoc @param 与 @returns 标注一个模块，记录新增的隐式 any 与 null 诊断。',
    independentPractice: '为一个 20 文件模块建立迁移队列，从无依赖工具函数开始转为 .ts，每批更新 import 扩展名与测试；用 typed boundary 文件阻挡新 any 进入领域层，最终关闭 allowJs 并删除临时声明。',
    commonErrors: [
      '一开始就把 allowJs、checkJs 与 strict 全部打开，数百个错误无法归因。',
      '把 JavaScript 文件重命名为 .ts 当作迁移完成，却没有修复隐式 any 和运行时边界。',
    ],
    sourceRefs: [TS_CONFIG, TS_DECLARATION, TS_DOCS],
    steps: [
      [
        'allowJs 与 checkJs 的先后',
        'allowJs 让编译器读取 JavaScript 并参与输出，checkJs 才会检查 JavaScript 内部表达式和 JSDoc；两者都不等于完整 TypeScript。先 allowJs 加 noEmit 找出解析与模块问题，再按目录开 checkJs。失败边界是生成目录同时包含 JS 与 TS 产物；验证动作是检查 showConfig 的 include 与 dist 目录。',
        '先把 JS 纳入项目图再提高检查',
      ],
      [
        'JSDoc 提供临时形状',
        '在 JavaScript 中用 /** @param {string} raw @returns {Result} */ 可让 checkJs 检查调用关系，function parse(raw) 不必立即改后缀。JSDoc 注释要与运行时行为一致，复杂泛型可暂用 .d.ts 桥接。失败边界是 JSDoc 写成 any 以消除错误；验证动作是搜索 any 注释并记录后续替换任务。',
        '注释类型也属于契约',
      ],
      [
        '从叶子模块向入口迁移',
        '优先迁移无运行时依赖的工具、类型和解析器，再迁移调用它们的模块；每批保持测试可运行，提交文件清单与新增 tsc 警告。入口边界可使用 unknown 与显式 Result，阻断外部 any。失败边界是同时改目录结构、构建器和语言；验证动作是每批比较旧新模块的对拍样例。',
        '迁移单元要能被独立回退',
      ],
      [
        '桥接声明与临时抑制',
        '对暂未迁移的 JavaScript 包，可在本地 .d.ts 声明公共形状，并在实现文件内用 @ts-expect-error 记录已跟踪问题；抑制必须带说明和截止版本。失败边界是桥接类型比实现宽，调用方误以为字段存在；验证动作是桥接声明只暴露经过测试的成员。',
        '每个抑制都应有退出路径',
      ],
      [
        '结束迁移的客观条件',
        '完成标准包括 include 中无 .js 源文件、allowJs 与 checkJs 可按需关闭、公开入口无 any、声明产物可由消费者加载、测试与类型检查均通过。失败边界是仍靠临时桥接发布；验证动作是复制干净工作区运行 pnpm install、typecheck、test、pack。',
        '迁移完成以约束撤除为证据',
      ],
    ],
  },
  {
    name: tsName(t4Stage, 'Project References 与构建顺序'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解 monorepo、tsconfig extends 和声明文件，能运行包的 build 脚本。',
    goal: '能用 Project References 建立包间增量依赖，理解 composite、declaration、tsbuildinfo 与 tsc -b 的关系，并区分路径映射和真实构建依赖。',
    guidedPractice: '建立 packages/core 与 packages/app 两个 tsconfig，给 core 设置 composite 与 declaration，在 app 的 references 中指向 core；运行 npx tsc -b，修改 core 一个类型后再次构建，观察增量和声明产物。',
    independentPractice: '把三条路径别名替换为真实 project references，确保 app 只依赖 core 的公开入口；删除 core 的 dist 后从根目录运行 tsc -b，验证构建顺序和新增 tsbuildinfo。',
    commonErrors: [
      '只写 paths 别名就以为建立了包依赖，实际构建时没有任何拓扑顺序。',
      '在被引用项目上设置仅检查的 noEmit，导致引用构建无法获得声明产物。',
    ],
    sourceRefs: [TS_CONFIG, TS_DECLARATION, TS_REPO],
    steps: [
      [
        'composite 与声明输出',
        '被引用项目设置 composite: true 后会生成构建信息并要求可输出声明，常用 declaration: true、rootDir: "src"、outDir: "dist"。引用方在 references 中写 { path: "../core" }，tsc -b 据此建立依赖。失败边界是 composite 项目同时把 emit 完全禁用；验证动作是删除 dist 后运行 tsc -b，确认声明重新出现。',
        '引用关系依赖可发布的类型产物',
      ],
      [
        'tsc -b 的拓扑与增量',
        'tsc -b 会按 references 拓扑顺序构建，读取 .tsbuildinfo 判断哪些项目需要更新；它不同于单项目 tsc --noEmit，能一次处理多包。失败边界是手工删除 tsbuildinfo 后把完整重建当成回归；验证动作是分别做冷构建与单文件修改构建并记录耗时。',
        '构建模式管理依赖图',
      ],
      [
        'paths 只负责解析',
        'tsconfig paths 把 import 别名映射到源码位置，方便编辑器和检查，但不自动安排构建，也不会改变发布包 exports。真实依赖应写在 package.json 与 project references，消费者通过公开入口导入。失败边界是 paths 指向 core/src 且绕过声明边界；验证动作是移除 paths 后仅通过 workspace 包入口构建。',
        '路径别名不能代替包契约',
      ],
      [
        '陈旧产物的识别与恢复',
        '引用项目可能因 dist 被复制、tsbuildinfo 丢失或 branch 切换而读取旧声明。CI 从干净工作区执行 tsc -b，必要时删除 dist 与 tsbuildinfo 做冷构建；不要删除用户其他未提交文件。失败边界是本地增量绿而 CI 冷构建红；验证动作是保留两套日志并比较首错项目。',
        '增量构建要有冷构建对照',
      ],
      [
        '多包构建完成标准',
        '验收包括每个包独立 tsc -b、根构建顺序正确、公开 .d.ts 可达、消费者只导入 exports、修改下层触发上层类型检查。失败边界是只看最后一个包成功；验证动作是故意改坏 core 类型，确认 app 编译失败并指明来源包。',
        '依赖图上的每一层都要能失败',
      ],
    ],
  },
  {
    name: tsName(t4Stage, '多包仓库中的类型边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '完成 Project References 练习，能阅读 package.json 的 exports 与 workspace 配置。',
    goal: '能为 monorepo 设计公开导出、共享 DTO 与内部实现边界，避免深层导入和跨包类型泄漏，并用独立消费者测试验证发布契约。',
    guidedPractice: '列出 core、api-client、ui 三包的导入关系，把 core/src/internal.ts 的深导入改为 core 公共导出；为 api-client 增加 exports 子路径，并建立禁止跨包 src 路径的 ESLint 规则。',
    independentPractice: '为共享 OrderDto 建立只含 wire 类型的 contracts 包，让服务端和客户端都依赖它；在 core 中转换为领域类型，禁止 contracts 反向依赖 core，最后用消费者工程验证两个包。',
    commonErrors: [
      '通过相对路径或 package/src 深导入绕过公共入口，发布后路径并不存在。',
      '让基础类型包反向依赖业务实现，造成循环和发布版本耦合。',
    ],
    sourceRefs: [NODE_PACKAGES, TS_MODULES, TS_DECLARATION],
    steps: [
      [
        '公开入口与内部模块',
        '每个包通过 package.json exports 声明 ".", "./schema" 等入口，内部文件不加导出；tsconfig paths 可以方便开发，但 lint 应禁止包外穿透 src。失败边界是 IDE 能跳转却安装 tarball 后找不到模块；验证动作是 pnpm pack 后在纯消费者工程导入所有公开入口。',
        '公共入口是唯一类型路径',
      ],
      [
        'exports 条件与类型入口',
        'Node 包 exports 可按 import、require、types 分条件，types 条件应放在运行时条件前或正确嵌套。TypeScript 和 Node 必须解析到兼容实现与声明。失败边界是 require 指向 ESM 文件或类型条件不可达；验证动作是分别用 node import、require 和 tsc 消费。',
        '同一入口要覆盖运行与类型解析',
      ],
      [
        '共享契约包的依赖方向',
        'contracts 只保存 DTO、错误码和 OpenAPI 相关类型，不依赖领域实现；core 可依赖 contracts 并转换为领域类型，api-client 也依赖 contracts。基础包版本应尽量稳定，避免所有包互相锁死。失败边界是领域类型被放进 contracts 导致客户端看到内部字段；验证动作是生成 contracts 声明并搜索实现专有符号。',
        '共享包要处在依赖图底层',
      ],
      [
        '跨包边界的运行时验证',
        'DTO 类型只描述形状，跨网络和持久化仍要 schema 解析；包间函数调用可依赖 TS 类型，但版本不一致时也必须处理旧的运行时对象。失败边界是 monorepo 类型同步让开发者误以为所有消费者同步升级；验证动作是安装上一个发布版本运行当前客户端测试。',
        '类型共享不等于版本同步',
      ],
      [
        '消费者夹具验证包边界',
        '建立隔离 fixture，安装打包产物而非 workspace 源码，分别通过公开入口导入并运行 tsc、ESM import 与 CJS require。再加一个反向依赖检查脚本或 lint 规则。失败边界是 fixture 仍通过 paths 回到 src；验证动作是打印解析路径并确认 node_modules 包。',
        '包边界要用真实安装验证',
      ],
    ],
  },
];

const t5Stage = '企业库、构建与发布';

const TYPESCRIPT_T5_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: tsName(t5Stage, 'tsup、rollup 与源码映射'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能运行 npm 或 pnpm 构建脚本，理解入口、产物格式和 source map 的基本用途。',
    goal: '能用 tsup 或 Rollup 生成 ESM、CJS 与声明产物，控制外部依赖、source map 和清理行为，并检查发布包实际内容。',
    guidedPractice: '建立 tsup.config.ts，设置 entry: ["src/index.ts"]、format: ["esm", "cjs"]、dts: true、sourcemap: true、clean: true 与 external: ["zod"]，运行构建后逐项检查 dist 文件与 import 语句。',
    independentPractice: '把同一库分别用 tsup 和 Rollup 构建，比较产物树、外部依赖是否被打包、声明文件路径和 source map 的 sourcesContent；选择一个方案并写出对消费者与发布大小的理由。',
    commonErrors: [
      '把运行时依赖一起打进 bundle，导致消费者出现重复实例或安全更新无法生效。',
      '只检查 dist 生成成功，没有检查入口、声明和 source map 是否都指向正确文件。',
    ],
    sourceRefs: [TS_MODULES, NODE_PACKAGES, TS_CONFIG],
    steps: [
      [
        '构建入口与多格式输出',
        'tsup.config.ts 的 entry 指向公开源码，format: ["esm", "cjs"] 生成两种模块，dts 生成类型声明，clean 删除旧产物。Rollup 需要显式 input 与 output 数组，并使用插件处理 TypeScript 与声明。失败边界是入口只导出一个文件却漏掉子路径；验证动作是列出 dist 并让每个公开入口都能被 import。',
        '入口决定发布包的表面',
      ],
      [
        '双格式产物的默认导出差异',
        'ESM 有严格模块语义，CJS require 通过 interop 读取；同一 default export 在两种格式可能被消费者解构方式不同。优先提供命名导出，避免依赖 default 的额外包装。失败边界是 ESM 文件被 require 直接加载；验证动作是分别写 import 与 require 消费夹具。',
        '格式兼容要由两种加载方式验证',
      ],
      [
        'source map 要能回到源文件',
        'sourcemap: true 生成 .map，构建器应保留 sourcesContent 或通过 sourcesRoot 指到可获取的源代码；Node 运行错误时依据 sourceMappingURL 才能显示原文件行列。失败边界是 npm 包只带 map 不带源文件，调试器无法展开；验证动作是在产物中故意抛错并查看堆栈映射。',
        '映射质量决定生产诊断成本',
      ],
      [
        '依赖外部化与副作用',
        '库通常把 zod、React 等运行时依赖列为 peer 或 external，由消费者提供单实例；纯工具依赖可打包但要审阅 license 与体积。package.json sideEffects: false 能帮助 tree shaking，前提是模块确实无导入副作用。失败边界是 external 了未声明 peer 的包；验证动作是检查产物 import 与安装后的依赖树。',
        '打包边界等于实例与升级边界',
      ],
      [
        '产物验收命令',
        '构建后运行 publint 检查 package.json 与文件布局，运行 @arethetypeswrong/cli 检查类型解析，再执行 pnpm pack 解压查看真实文件。失败边界是本地 workspace 路径掩盖发布缺口；验证动作是在临时目录安装 tarball 后执行 ESM、CJS 与 tsc。',
        '发布包而不是工作区才是最终产物',
      ],
    ],
  },
  {
    name: tsName(t5Stage, 'package exports 和模块解析'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '理解 ESM 与 CommonJS，读过 package.json 的 main、types 和 exports 字段。',
    goal: '能设计覆盖 import、require、types 与子路径的 exports 映射，保证 Node 与 TypeScript 解析到同一公开入口，并用工具和消费者夹具验证。',
    guidedPractice: '为库写 exports: { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }, "./schema": { "types": "./dist/schema.d.ts", "import": "./dist/schema.js" } }，分别用 import、require 和 tsc 导入。',
    independentPractice: '给库增加 ./testing 子路径，发布 tarball 后写三个消费者：ESM Node、CJS Node 与 moduleResolution: NodeNext 的 TypeScript；确认三者路径正确且没有深层 src 导入。',
    commonErrors: [
      '只写 main 和 types，没有同步 exports，导致现代解析器找不到入口。',
      'types 条件放在 import 之后或指向源码，消费者只得到运行时文件而丢失声明。',
    ],
    sourceRefs: [NODE_PACKAGES, TS_MODULES, TS_CONFIG],
    steps: [
      [
        'exports 条件映射',
        'package.json exports 以子路径为键，每个入口可按 types、import、require 等条件给文件。Node 使用运行时条件，TypeScript 依据模块解析模式寻找 types；文件必须真实存在。失败边界是 exports 字段一旦出现会封装未列出的子路径；验证动作是列出所有公开入口并逐一导入。',
        'exports 是发布包的允许列表',
      ],
      [
        'types 条件与解析模式',
        'NodeNext 和 Bundler 读取 exports 的方式不同，types 应指向与运行时入口匹配的 .d.ts，不能只依赖根目录 main。若 ESM 入口是 dist/index.js，其声明最好为 dist/index.d.ts 或 d.mts，并在 exports 中可达。失败边界是运行时与类型指向不同版本；验证动作是同时打印 Node 导出与 tsc 跳转位置。',
        '类型解析必须跟随实际入口',
      ],
      [
        '命名导出与互操作',
        'ESM 与 CJS 的 default、命名导出和 interop 行为不等价，库应尽量使用命名导出并明确 CJS 包装。exports 不能解决所有 bundler 差异，需要在文档中标注支持矩阵。失败边界是消费者 import default 得到 undefined；验证动作是真实 packaging 后的 import 与 require 测试。',
        '导出语法也是公共契约',
      ],
      [
        '子路径入口与扩展名',
        '"./schema" 子路径应指向独立文件，不能依赖消费者猜扩展名；Node ESM 中相对导入必须写 .js，TypeScript NodeNext 也会沿用。package type 与文件扩展名决定运行时解释。失败边界是开发时 paths 省略扩展名而发布后 Node 报 ERR_MODULE_NOT_FOUND；验证动作是删除 paths，仅用打包入口运行。',
        '发布路径不能依赖编辑器别名',
      ],
      [
        'publint 与类型解析检查',
        'publint 能发现 exports 与文件不匹配、类型字段缺失等问题，@arethetypeswrong/cli 可显示不同解析模式下的类型结果。将它们加入发布前脚本，并保留人工 ESM/CJS 夹具。失败边界是工具通过却没有真实命名导出；验证动作是执行最小消费者运行和 tsc。',
        '静态检查与真实加载要同时通过',
      ],
    ],
  },
  {
    name: tsName(t5Stage, '声明产物与 API 兼容'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能生成 .d.ts，理解类型导出与 package exports 的基本关系。',
    goal: '能控制声明产物的公开表面，避免私有类型泄漏，用 API Extractor 报告和消费者类型测试检查兼容性，并验证声明映射与 tarball。',
    guidedPractice: '为库开启 declaration 与 declarationMap，生成 dist/index.d.ts 后搜索是否出现 internal 路径；再用 API Extractor 生成 api-report，修改一个导出参数类型并观察报告差异。',
    independentPractice: '为一个公开函数增加重载和返回对象，生成声明后写 expect-type 消费者测试；确保参数名、字面量联合和错误码没有因 declaration emit 被宽化。',
    commonErrors: [
      '公开声明直接引用 src/internal/types.ts，消费者安装后无法解析该私有路径。',
      '只看源码类型测试，不检查打包后的 .d.ts 与 API 报告。',
    ],
    sourceRefs: [TS_DECLARATION, API_EXTRACTOR, TS_MODULES],
    steps: [
      [
        '声明产物控制公开形状',
        'tsc 或 tsup 的声明生成会把实现导出投影成 .d.ts，公开函数的参数名、泛型约束、字面量和类型引用都会影响消费者。构建后应打开 dist/index.d.ts 逐段审阅，而不是只确认文件存在。失败边界是声明生成包含实现文件路径；验证动作是运行 publint 和消费者 tsc。',
        '声明文件是发布后的源码契约',
      ],
      [
        '私有符号与路径泄漏',
        '如果公开函数返回未导出的 class 或内部别名，声明可能引用不可达路径，消费者出现 Cannot find module；可显式导出支撑类型，或用 Public 投影只暴露必要字段。失败边界是私有字段被类型结构无意暴露；验证动作是在隔离工程安装 tarball 并编译。',
        '公开返回类型必须完整可达',
      ],
      [
        'API Extractor 报告兼容',
        'API Extractor 读取入口声明生成 api-report.md，可把公开签名固定为审阅工件；新版本运行 api-extractor run --local 比较报告，删除或改名会进入 diff。失败边界是生成报告不代表运行时兼容；验证动作是配合消费者运行测试。',
        '公开签名变化需要显式审阅',
      ],
      [
        'declaration map 与定位',
        'declaration: true 与 declarationMap: true 后，编辑器可从 .d.ts 跳回原始 .ts；source map 则服务运行时代码。两者文件都要进入发布包且路径匹配。失败边界是 map 指向 CI 临时目录；验证动作是解压 tarball 查看 sources 路径。',
        '两类映射服务不同调试场景',
      ],
      [
        '以 tarball 验证声明入口',
        '执行 pnpm pack 后安装到临时消费者，使用 exports 的公开入口运行 tsc --traceResolution，确认读取的是包内 .d.ts；再运行最小示例调用所有公开函数。失败边界是 workspace symlink 绕过真实文件；验证动作是打印实际解析路径并确认位于 node_modules 包目录。',
        '声明验收必须脱离源码工作区',
      ],
    ],
  },
  {
    name: tsName(t5Stage, 'ESLint、测试和发布流水线'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能配置 package scripts，理解 CI、测试矩阵和制品的基本流程。',
    goal: '能建立类型感知 lint、类型检查、单元测试、构建和打包检查的发布流水线，配置 Node 与 TypeScript 版本矩阵，并保存可追溯制品。',
    guidedPractice: '为库添加 typecheck、lint、test、build、check:pack 脚本，在 CI 中先安装锁文件依赖，再依次运行 tsc --noEmit、ESLint、Vitest、tsc -b 与 publint；故意提交一个未使用变量和一个错误类型，确认两步分别失败。',
    independentPractice: '建立 Node 20/22 与最低支持 TypeScript 版本的矩阵，生成 tarball、计算校验和并上传；再模拟一次发布失败，验证流水线不会创建 tag 或覆盖 npm 包。',
    commonErrors: [
      'CI 只运行单元测试，不运行声明构建和真实包安装，类型入口坏了仍发布。',
      '在测试通过前就执行发布，失败后不可回滚已上传版本。',
    ],
    sourceRefs: [TS_DOCS, NODE_PACKAGES, API_EXTRACTOR],
    steps: [
      [
        '脚本顺序与环境固定',
        'package scripts 应拆分 typecheck、lint、test、build、check:pack，CI 清楚记录每步退出码；使用 pnpm install --frozen-lockfile 固定依赖。失败边界是 lint 自动修复后继续通过而不保留原件；验证动作是在干净容器重跑，确认命令不依赖本地缓存。',
        '每一步只承担一种质量证据',
      ],
      [
        '类型感知 lint 与公共规则',
        'ESLint 使用 TypeScript parser 与 type-aware 规则可发现 floating promises、错误 await 和不安全 any，但配置要限定到真实 tsconfig，避免性能失控。库还可禁止 deep import 与未导出符号。失败边界是 lint 与 tsc 配置指向不同环境；验证动作是让同一非法代码在两条命令中报错。',
        'Lint 规则也要基于正确项目图',
      ],
      [
        '测试矩阵覆盖支持边界',
        '单元测试验证行为，类型测试验证签名，最低 Node 与最低 TypeScript 版本验证兼容；矩阵不必无限扩大，但每个声明支持的组合应至少有一个消费者任务。失败边界是只在最新版本测试却声明兼容旧版；验证动作是查看 CI job 名称与版本输入。',
        '支持范围必须有执行证据',
      ],
      [
        '制品、校验和与 provenance',
        '发布前运行 pnpm pack，保存 tarball、sha512 与构建日志，发布任务只消费已通过检查的制品；启用 npm provenance 或等价 attestation 时确保 CI 身份和仓库权限正确。失败边界是发布会现场重新构建，制品与测试对象不同；验证动作是比较测试制品与发布制品 sha。',
        '测试通过的制品才能进入发布',
      ],
      [
        '发布门禁与失败恢复',
        '门禁至少包含 typecheck、lint、test、build、publint、api-report diff、消费者安装；若发布失败，不得创建 release tag 或覆盖同名版本。失败边界是 tag 已推送但包未上传；验证动作是在 pre-release 演练中模拟 registry 拒绝并检查流水线状态。',
        '发布原子性由流水线保证',
      ],
    ],
  },
  {
    name: tsName(t5Stage, '迁移、deprecation 与版本策略'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '完成 API 兼容、构建和发布流水线课程，能为消费者编写迁移测试。',
    goal: '能为 TypeScript 库制定语义化版本、弃用窗口、兼容别名、codemod 和回滚方案，以真实消费者证据决定主版本迁移。',
    guidedPractice: '把一个旧方法改名，在旧名上写 @deprecated JSDoc 并让旧方法委托新实现；生成新的 api-report，分别用旧消费者和新消费者编译，记录两个版本的提示与运行结果。',
    independentPractice: '为一个 breaking change 写迁移指南：旧新代码对照、codemod 输入输出、弃用期监控、回滚包和主版本发布清单；用至少两个真实消费者版本执行迁移。',
    commonErrors: [
      '在同一主版本内删除公开类型，只依赖源码中的调用方同步升级。',
      '提供 codemod 后不保留旧输入夹具，无法验证转换后的语义和类型。',
    ],
    sourceRefs: [TS_DECLARATION, API_EXTRACTOR, NODE_PACKAGES],
    steps: [
      [
        '按公开 API 分类版本',
        '新增可选参数或导出通常可进入次版本，删除导出、修改参数类型、收紧回调或改默认行为需要主版本。类型层破坏即使运行时没变，也会让消费者 tsc 失败，因此必须计入 API 差异。失败边界是只按运行测试判断兼容；验证动作是生成两个版本的 api-report 并逐项分类。',
        '类型破坏也是发布破坏',
      ],
      [
        '兼容别名与单一实现',
        '旧函数可在 JSDoc 标记 deprecated 后委托新实现，参数转换在一个适配函数中完成；不要复制两份业务逻辑。旧类型的泛型默认值可以保留兼容，但必须限定废弃期限。失败边界是兼容层慢慢改变语义；验证动作是用同一组输入对旧新入口对拍。',
        '兼容层应薄且行为可对照',
      ],
      [
        '弃用信息进入多个渠道',
        'JSDoc 让编辑器显示删除线，README 与 changelog 说明替代方案，运行时可在开发模式告警或发送版本指标；npm 包可用 deprecation 字段提示。失败边界是只在 issue 中讨论弃用；验证动作是安装旧版本查看 registry 提示，再查看声明中的 deprecated 标记。',
        '弃用信号要到达真实开发者',
      ],
      [
        'codemod 与迁移样例',
        'codemod 接收旧源码 AST，只改可识别的导入与调用，输出新源码并保留注释；每个转换规则要有输入、输出与无法自动迁移的拒绝用例。失败边界是正则替换误改字符串和同名局部变量；验证动作是在夹具仓库运行 codemod 后再运行 tsc 与测试。',
        '自动迁移必须可验证和可拒绝',
      ],
      [
        '主版本发布与回滚',
        '删除旧 API 前完成消费者矩阵、迁移文档、回滚包和沟通窗口；发布后监控安装版本、类型错误与错误率，异常时 yank 或撤回 dist-tag 并提供前一稳定版本。失败边界是把回滚理解成重新上传同版本号；验证动作是预演切换 dist-tag 并安装旧包。',
        '版本删除需要回滚路径',
      ],
    ],
  },
  {
    name: tsName(t5Stage, 'TypeScript 企业基础库毕业项目'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '完成 T0 至 T5 前的编译、领域建模、API、类型测试和发布课程。',
    goal: '能交付一个具备领域类型、运行时解析、版本化 API、类型测试、双格式构建和发布验证的 TypeScript 基础库，并留下可复现验收记录。',
    guidedPractice: '从空目录建立 order-kernel 包，公开创建订单、解析 DTO 和计算应付金额三类 API；先写公开类型与 OpenAPI 形状，再实现 schema、领域转换、错误码和消费者样例。',
    independentPractice: '完成发布候选：生成 ESM/CJS 与 .d.ts，运行 typecheck、Vitest、expect-type、publint、arethetypeswrong、pack 后安装测试；同时提交迁移说明、依赖版本和回滚步骤。',
    commonErrors: [
      '公开 many 内部实现类型，导致首次补丁就破坏消费者。',
      '只验证本地 workspace，不验证打包后 exports、声明与双格式加载。',
    ],
    sourceRefs: [TS_DOCS, OPENAPI, NODE_PACKAGES],
    steps: [
      [
        '冻结公开 API 与版本目标',
        '列出所有 exports 子路径、函数签名、错误码和线协议，标记本版本必须稳定与可弃用的部分；为每个 API 写至少一个合法消费者和失败消费者。失败边界是公开类型引用 internal 文件；验证动作是先写 api-report 草案，再开始实现。',
        '先确定消费者看到的表面',
      ],
      [
        '领域类型与运行时解析连通',
        '订单金额使用整数分与品牌标识，状态使用判别联合；HTTP DTO 通过 Zod 或 Valibot 解析后构造领域对象，错误结果带稳定 code。内部模块只依赖公开契约包。失败边界是解析器直接返回 as Domain；验证动作是让缺字段、跨租户和非法金额在产生副作用前失败。',
        '静态模型要在运行时入口落地',
      ],
      [
        '类型测试覆盖公开入口',
        '为成功值、错误分支、默认泛型和禁止字段写 expect-type 断言，并从打包声明而非 src 导入；生成 .d.ts 后检查私有符号与路径。失败边界是测试只覆盖 happy path；验证动作是删除一个错误码并确认 api-report 与类型测试同时变红。',
        '公开契约需要编译期回归',
      ],
      [
        '构建双格式与完整入口',
        '使用 tsup 或 Rollup 生成 dist/index.js、dist/index.cjs 与声明，package exports 同时列出 types、import、require 和子路径；外部化 peerDependencies，产物保留 source map。失败边界是 ESM 能用而 CJS 类型或导出缺失；验证动作是运行 publint、attw 与真实 import/require 夹具。',
        '每个公开入口必须可加载、可类型化',
      ],
      [
        '发布候选验收与回滚',
        '在干净工作区执行 frozen install、typecheck、lint、test、build、pack、消费者安装、契约测试和 API 差异检查；保存 tarball 哈希、CI 日志、支持的 Node/TypeScript 版本与 dist-tag 回滚命令。失败边界是发布现场临时构建；验证动作是安装候选包运行迁移样例，并模拟切回上一版本。',
        '可安装、可升级、可回滚才算交付',
      ],
    ],
  },
];

const typescriptExamples: Record<string, readonly LearningV2LessonExample[]> = {};

const tsExample = (
  title: string,
  code: string,
  output: string,
): LearningV2LessonExample => ({
  title,
  language: 'TypeScript + tsc/Node',
  code,
  output,
});

Object.assign(typescriptExamples, {
  'TypeScript 编译器与 JavaScript 运行时': [
    tsExample(
      '检查通过后再生成可执行 JavaScript',
      `// src/main.ts
type Order = { id: string; total: number };
const order: Order = { id: 'A-17', total: 42 };
const label = order.id + ':' + order.total;
console.log(label);

// 在空项目中执行
// npx tsc src/main.ts --strict --outDir dist
// node dist/main.js
// 把 total 改成字符串后，第一条命令报告 TS2322 并返回非零退出码`,
      `node 输出 A-17:42；tsc 无诊断且退出码为 0。
失败边界：total 写成 '42' 时 tsc 在生成前返回 TS2322，dist 中不会出现新的可执行结果。`,
    ),
    tsExample(
      '类型擦除后仍保留 enum 运行时对象',
      `// src/erasure.ts
interface User { id: string; name: string }
enum Channel { Web = 'web', Api = 'api' }
const user: User = { id: 'u-1', name: 'Ada' };
const channel: Channel = Channel.Api;
console.log(JSON.stringify({ user, channel }));

// npx tsc src/erasure.ts --strict --outDir dist
// Select-String -Path dist/erasure.js -Pattern 'interface|Channel'
// node dist/erasure.js`,
      `产物保留 Channel 对象，但不再包含 interface User；Node 输出 {"user":{"id":"u-1","name":"Ada"},"channel":"api"}。
失败边界：把网络返回值直接 as User 只会消除编译提示，缺少 name 时运行时仍会带着残缺对象继续执行。`,
    ),
    tsExample(
      '用退出码捕获 TS2322 诊断',
      `// src/port.ts
const rawPort: string = '3000';
// 故意保留类型错误：下一行应报告 TS2322
const port: number = rawPort;
console.log(port);

// npx tsc src/port.ts --strict --noEmit --pretty false
// 修正为 const port = Number(rawPort) 后再次执行
// npx tsc src/port.ts --strict --noEmit --pretty false
// Write-Output "exit=$LASTEXITCODE"`,
      `未修正时输出 src/port.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'，退出码为 1；修正后无诊断，退出码为 0。
失败边界：脚本吞掉 tsc 的 stderr 或用分号继续执行，会让 CI 在类型检查失败时仍然显示绿色。`,
    ),
    tsExample(
      'DOM 声明存在不代表 Node 运行时存在',
      `// src/runtime.ts
// tsconfig 使用 lib: ["ES2022", "DOM"] 时 document 可以通过检查
const title = typeof document === 'undefined'
  ? 'node-without-dom'
  : document.title;
console.log(title);

// npx tsc src/runtime.ts --strict --lib ES2022,DOM --outDir dist
// node dist/runtime.js
// 把 typeof 判断删掉后再次运行 Node`,
      `带运行时判断时输出 node-without-dom；删除判断后 tsc 仍通过，但 Node 抛出 ReferenceError: document is not defined。
失败边界：lib 只提供环境形状，不会给进程注入 DOM；部署前必须在目标运行时执行入口。`,
    ),
    tsExample(
      '一次构建生成 JS、声明和源码映射',
      `// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true,
    "noEmitOnError": true,
    "strict": true
  },
  "include": ["src"]
}

// src/index.ts
export const version: string = '1.0.0';
console.log(version);

// npx tsc -p tsconfig.json
// Get-ChildItem dist
// node dist/index.js`,
      `dist 中出现 index.js、index.d.ts 和 index.js.map，Node 输出 1.0.0。
失败边界：noEmitOnError 打开后只要源码有诊断，构建不会更新旧产物；发布前必须清理并确认文件时间，避免把过期 dist 一起打包。`,
    ),
  ],
  'tsconfig strict、target、module 与 lib': [
    tsExample(
      'extends 后核对最终文件集合',
      `// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext"
  }
}

// tsconfig.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "coverage"]
}

// src/main.ts
const values: string[] = ['a'];
console.log(values[1] ?? 'missing');

// npx tsc --showConfig
// npx tsc --noEmit`,
      `showConfig 展开 strict、target、noUncheckedIndexedAccess 与 include；程序输出 missing 且 tsc 返回 0。
失败边界：include 误写 dist 后生成文件会再次进入项目并产生重复声明；必须检查 showConfig 的 files，而不是只相信编辑器。`,
    ),
    tsExample(
      '用逐项严格开关定位隐式 any',
      `// src/strict.ts
function display(user: { name: string }): string {
  return user.name.toUpperCase();
}

console.log(display({ name: 'Ada' }));

// 在 tsconfig 设置 strict: true
// 临时改成 function display(user) 后运行
// npx tsc src/strict.ts --strict --noEmit --pretty false
// 恢复参数注解后再次执行`,
      `临时去掉注解时报告 TS7006: Parameter 'user' implicitly has an 'any' type；恢复后无诊断并输出 ADA。
失败边界：只在新目录开启 strict 会让共享配置沿用的旧文件继续漏检；CI 必须使用同一份最终配置。`,
    ),
    tsExample(
      '对比 ES2022 与 ES5 的可选链产物',
      `// src/target.ts
type User = { profile?: { city?: string } };
const user: User = {};
const city = user.profile?.city ?? 'unknown';
console.log(city);

// npx tsc src/target.ts --target ES2022 --module commonjs --outDir dist-es2022
// npx tsc src/target.ts --target ES5 --module commonjs --outDir dist-es5
// Select-String -Path dist-es2022/target.js -Pattern '?.'
// Select-String -Path dist-es5/target.js -Pattern '=== null'`,
      `两份程序都输出 unknown；ES2022 产物保留可选链，ES5 产物改写成显式 null/undefined 判断。
失败边界：target 只降级语法，不会给旧环境补齐 Promise；运行时能力仍需单独验证和 polyfill。`,
    ),
    tsExample(
      'NodeNext 相对导入必须匹配生成文件名',
      `// package.json
{ "type": "module", "scripts": { "check": "tsc --noEmit" } }

// tsconfig.json
{ "compilerOptions": { "target": "ES2022", "module": "NodeNext",
  "moduleResolution": "NodeNext", "strict": true, "outDir": "dist" },
  "include": ["src"] }

// src/math.ts
export const double = (value: number): number => value * 2;

// src/main.ts
import { double } from './math.js';
console.log(double(21));

// npx tsc && node dist/main.js
// 把导入改成 './math' 后再次运行 tsc`,
      `正确导入运行输出 42；去掉 .js 后 NodeNext 检查报告 TS2835，提示相对导入路径需要显式扩展名。
失败边界：moduleResolution 不是运行时加载器；即使编辑器接受省略扩展名，目标 Node ESM 仍可能报 ERR_MODULE_NOT_FOUND。`,
    ),
    tsExample(
      '限制 types 并验证 Node 全局声明',
      `// package.json
{ "type": "module", "devDependencies": { "typescript": "^5.7.0", "@types/node": "^22.0.0" } }

// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src"]
}

// src/platform.ts
console.log(process.version);
// 添加 console.log(document.title) 后运行 npx tsc --noEmit

// pnpm install && npx tsc --noEmit`,
      `第一版只使用 process，tsc 通过；加入 document 后报告 TS2584: Cannot find name 'document'。
失败边界：skipLibCheck 只跳过声明文件内部错误，不会让缺失的 DOM 全局凭空出现，也不会跳过自己源码的类型错误。`,
    ),
  ],
  '基础类型、推断与类型注解': [
    tsExample(
      '观察 let、const 与 as const 的字面量精度',
      `// src/literals.ts
let mutableStatus = 'open';
mutableStatus = 'closed';
const fixedStatus = 'open';
const config = { status: 'draft', retries: 2 } as const;

console.log(JSON.stringify({ mutableStatus, fixedStatus, config }));
// 在编辑器中悬停三个符号，或生成声明后查看：
// npx tsc src/literals.ts --strict --declaration --emitDeclarationOnly --outDir types
// Get-Content types/literals.d.ts`,
      `运行时输出 {"mutableStatus":"closed","fixedStatus":"open","config":{"status":"draft","retries":2}}；声明文件中 config.status 保持 "draft"。
失败边界：把可变状态写成单一字面量后，后续合法的 closed 赋值会被 tsc 拒绝。`,
    ),
    tsExample(
      '回调参数由数组元素类型获得上下文',
      `// src/inference.ts
const rawValues = [' 3 ', ' 5 ', ' 8 '];
const values = rawValues.map((value) => Number(value.trim()));
const total = values.reduce((sum, value) => sum + value, 0);

function pickLabel<T>(rows: readonly T[], read: (row: T) => string): string[] {
  return rows.map(read);
}

console.log(pickLabel([{ id: 1, name: 'Ada' }], row => row.name), total);

// npx tsc src/inference.ts --strict --noEmit
// node --experimental-strip-types src/inference.ts`,
      `类型检查通过，Node 输出 [ 'Ada' ] 16；value 和 row 都由上下文推导，无需重复注解。
失败边界：把回调抽成独立未注解函数后，参数会失去上下文而触发隐式 any；此时应在函数参数上补最小类型。`,
    ),
    tsExample(
      'unknown 在读取字段前必须收窄',
      `// src/unknown.ts
function readName(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null || !('name' in raw)) {
    return 'unknown';
  }
  const name = (raw as { name: unknown }).name;
  return typeof name === 'string' ? name : 'invalid';
}

const parsed: unknown = JSON.parse('{"name":"Ada"}');
console.log(readName(parsed), readName(null), readName({ name: 42 }));

// npx tsc src/unknown.ts --strict --noEmit
// node --experimental-strip-types src/unknown.ts`,
      `程序输出 Ada unknown invalid；unknown 必须先通过 typeof、null 和 in 检查才能安全读取。
失败边界：把 JSON.parse 结果直接写成 User 或用 as User，会让缺少字段的数据继续流向业务逻辑。`,
    ),
    tsExample(
      '可选链和空值合并处理缺失字段',
      `// src/nullish.ts
type User = { name?: string | null; address?: { zip?: string } };
const users: User[] = [
  { name: 'Ada', address: { zip: '10001' } },
  { name: null },
  {},
];

for (const user of users) {
  const name = user.name ?? '匿名';
  const zip = user.address?.zip ?? '未填写';
  console.log(name + ':' + zip);
}

// npx tsc src/nullish.ts --strict --noEmit
// node --experimental-strip-types src/nullish.ts`,
      `输出 Ada:10001、匿名:未填写、匿名:未填写；空值在读取边界被显式处理。
失败边界：user!.address.zip 只关闭类型检查，遇到空地址时运行时仍抛 TypeError，断言不能替代保护。`,
    ),
    tsExample(
      '导出函数用 unknown 入参和完整返回类型',
      `// src/config.ts
export type Config = { readonly host: string; readonly port: number };

export function parseConfig(raw: unknown): Config {
  if (typeof raw !== 'object' || raw === null) throw new Error('config must be object');
  const value = raw as Record<string, unknown>;
  if (typeof value.host !== 'string') throw new Error('host required');
  if (typeof value.port !== 'number' || !Number.isInteger(value.port)) {
    throw new Error('port must be integer');
  }
  return { host: value.host, port: value.port };
}

console.log(parseConfig({ host: 'localhost', port: 3000 }));

// npx tsc src/config.ts --strict --declaration --outDir dist
// Get-Content dist/config.d.ts
// node dist/config.js`,
      `声明文件暴露 parseConfig(raw: unknown): Config，运行时输出 { host: 'localhost', port: 3000 }。
失败边界：返回未导出的内部实现类型会让消费者无法命名结果；注解应集中在公开边界，内部临时值继续推断。`,
    ),
  ],
  '函数、对象、数组与元组': [
    tsExample(
      '默认参数与只读数组组成稳定函数签名',
      `// src/join.ts
function join(parts: readonly string[], separator = ','): string {
  return parts.join(separator);
}

const tags = ['typescript', 'node'];
console.log(join(tags));
console.log(join(tags, ' | '));

// npx tsc src/join.ts --strict --noEmit
// node --experimental-strip-types src/join.ts`,
      `输出 typescript,node 和 typescript | node；readonly 参数接受普通数组并禁止函数内部改写它。
失败边界：函数可能走空分支时返回类型必须写成 string | undefined；强行标成 string 会让调用方漏掉空值处理。`,
    ),
    tsExample(
      '结构类型允许通过变量绕开多余属性检查',
      `// src/struct.ts
type Point = { x: number; y: number };
const literal: Point = { x: 1, y: 2 };
const source = { x: 3, y: 4, label: 'guest' };
const fromVariable: Point = source;

console.log(Object.keys(fromVariable));
// 直接写 const direct: Point = { x: 5, y: 6, z: 7 } 会触发多余属性检查
// npx tsc src/struct.ts --strict --noEmit
// node --experimental-strip-types src/struct.ts`,
      `运行时输出 [ 'x', 'y', 'label' ]；fromVariable 仍保留额外字段，只是类型层只保证 x、y。
失败边界：多余属性检查不会删除对象字段；若业务要求字段严格封闭，需要在运行时解析或拒绝未知键。`,
    ),
    tsExample(
      'readonly string[] 阻止函数内部改写',
      `// src/readonly-array.ts
function firstTag(tags: readonly string[]): string {
  // tags.push('admin'); // TS2339
  return tags[0] ?? 'none';
}

const tags = ['typescript', 'node'];
tags.push('api');
console.log(firstTag(tags), tags.length);

// npx tsc src/readonly-array.ts --strict --noEmit
// node --experimental-strip-types src/readonly-array.ts
// 取消 push 注释后重新运行 tsc`,
      `正常运行输出 typescript 3；取消 push 后 tsc 报告 TS2339: Property 'push' does not exist on type 'readonly string[]'。
失败边界：readonly 只约束这个引用，原数组持有者仍可修改；需要真正不可变时还要冻结或复制数据。`,
    ),
    tsExample(
      'as const 保留二维坐标的两个槽位',
      `// src/tuple.ts
type Point = readonly [number, number];
function distance([x, y]: Point): number {
  return Math.hypot(x, y);
}

const pair = [3, 4] as const;
console.log(distance(pair));
// const wrong: Point = [1, 2, 3];
// npx tsc src/tuple.ts --strict --noEmit
// node --experimental-strip-types src/tuple.ts`,
      `程序输出 5；普通 number[] 不能满足 Point，as const 让 pair 保留恰好两个数值槽位。
失败边界：函数若只接收 number[]，运行时仍可能收到长度为 0 的数组；固定长度必须在签名或入口校验。`,
    ),
    tsExample(
      '重载公开两种调用形状并统一实现',
      `// src/format.ts
function format(value: string): string;
function format(value: number): string;
function format(value: string | number): string {
  return typeof value === 'number' ? value.toFixed(2) : value.trim();
}

const parse = (raw: string): string[] => raw.split(',').map(item => item.trim());
console.log(format(12), format(' Ada '), parse('a, b'));

// npx tsc src/format.ts --strict --noEmit
// node --experimental-strip-types src/format.ts
// 调用 format(true) 验证 TS2769`,
      `输出 12.00、Ada、[ 'a', 'b' ]；两个公开签名都对应到同一个运行时实现。
失败边界：重载声明增加第三种输入但实现漏掉分支时，类型检查可能通过而运行结果错误；每个签名都需要调用夹具。`,
    ),
  ],
  'interface、type 与声明合并': [
    tsExample(
      '同名 interface 在作用域内合并成员',
      `// src/client.ts
interface Client { request(path: string): Promise<string> }
interface Client { trace(id: string): void }

const client: Client = {
  async request(path) { return 'GET ' + path; },
  trace(id) { console.log('trace=' + id); },
};

client.trace('r-1');
console.log(await client.request('/health'));

// npx tsc src/client.ts --strict --target ES2022 --module NodeNext --noEmit`,
      `trace 输出 trace=r-1，随后输出 GET /health；Client 同时拥有 request 与 trace。
失败边界：不同包的同名接口若字段冲突，诊断可能落在加载链末端；应只通过一个明确的增强入口合并。`,
    ),
    tsExample(
      'type 联合固定成功与失败状态',
      `// src/result.ts
type Result =
  | { ok: true; value: number }
  | { ok: false; error: string };

function parse(raw: string): Result {
  const value = Number(raw);
  return Number.isFinite(value)
    ? { ok: true, value }
    : { ok: false, error: 'not-a-number' };
}

for (const raw of ['12', 'oops']) {
  const result = parse(raw);
  console.log(result.ok ? result.value : result.error);
}

// npx tsc src/result.ts --strict --noEmit`,
      `输出 12 和 not-a-number；ok 字段让每个分支只能访问自己的载荷。
失败边界：type alias 不能通过第二次同名声明追加成员；公共联合要扩展时必须修改源类型并重新发布。`,
    ),
    tsExample(
      '有限键 Record 拒绝任意字符串索引',
      `// src/labels.ts
type Side = 'left' | 'right';
const labels: Record<Side, string> = { left: 'L', right: 'R' };

function labelFor(side: Side): string {
  return labels[side];
}

console.log(labelFor('left'), labelFor('right'));
// labelFor('middle'); // TS2345
// npx tsc src/labels.ts --strict --noEmit
// node --experimental-strip-types src/labels.ts`,
      `程序输出 L R；middle 不是 Side，因此在编译期被拒绝。
失败边界：把键改成 string 会允许不存在的键；开启 noUncheckedIndexedAccess 后动态索引还必须处理 undefined。`,
    ),
    tsExample(
      '可调用对象同时携带版本元数据',
      `// src/parser.ts
type Parser = ((raw: string) => { id: string }) & { version: string };

const parser = ((raw: string) => ({ id: raw.trim() })) as Parser;
parser.version = '2.1.0';

function run(fn: Parser, raw: string): void {
  console.log(fn(raw).id + '@' + fn.version);
}

run(parser, ' a-1 ');

// npx tsc src/parser.ts --strict --noEmit
// node --experimental-strip-types src/parser.ts`,
      `输出 a-1@2.1.0；函数本身可以被调用，同时 version 属性也满足类型契约。
失败边界：类型断言不会自动添加 version 属性；若运行时忘记赋值，打印时仍会得到 undefined。`,
    ),
    tsExample(
      '模块增强通过独立声明入口进入项目',
      `// src/client.ts
export interface Client { request(): Promise<string> }
export const createClient = (): Client => ({
  request: async () => 'ok',
});

// src/client-augment.d.ts
import './client.js';
declare module './client.js' {
  interface Client { trace(id: string): void }
}

// src/main.ts
import { createClient } from './client.js';
import './client-augment.js';
const client = createClient();
client.trace = id => console.log('trace=' + id);
client.trace('a-1');

// npx tsc --strict src/main.ts src/client.ts src/client-augment.d.ts --module NodeNext --noEmit`,
      `增强入口被包含时 client.trace 调用通过类型检查；未导入该声明文件时报告 TS2339。
失败边界：增强文件若未进入 package exports 或消费者 tsconfig，发布后调用方完全看不到新增成员。`,
    ),
  ],
  '严格模式下的第一项目': [
    tsExample(
      '从空目录固定编译器版本与脚本',
      `// PowerShell
pnpm init
pnpm add -D typescript

// package.json，保留关键字段
{
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.build.json"
  },
  "devDependencies": { "typescript": "^5.7.0" }
}

// src/main.ts
console.log('strict-project');

// pnpm exec tsc --version
// pnpm typecheck`,
      `tsc --version 显示项目安装的 5.x 版本，typecheck 无诊断并返回 0。
失败边界：依赖全局 tsc 会让本地和 CI 版本漂移；诊断码和产物可能随编译器版本变化，版本必须写进锁文件。`,
    ),
    tsExample(
      '检查配置与构建配置分层',
      `// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "rootDir": "src"
  },
  "include": ["src"]
}

// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist", "declaration": true,
    "sourceMap": true, "noEmitOnError": true
  }
}

// npx tsc --showConfig
// npx tsc -p tsconfig.build.json
// Get-ChildItem dist`,
      `showConfig 展示合并后的严格选项；构建后 dist 中出现 .js、.d.ts 和 .js.map。
失败边界：两个配置若使用不同 rootDir，产物会多出一层 src 目录；必须检查最终入口路径而不是只看命令成功。`,
    ),
    tsExample(
      '公开 index 只重导出稳定 API',
      `// src/domain.ts
export type User = { readonly id: string; readonly name: string };
export const parseUser = (raw: { id: string; name: string }): User => ({
  id: raw.id.trim(), name: raw.name.trim(),
});

// src/index.ts
export { parseUser } from './domain.js';
export type { User } from './domain.js';

// src/main.ts
import { parseUser } from './index.js';
console.log(parseUser({ id: ' u1 ', name: ' Ada ' }));

// npx tsc --strict --module NodeNext --outDir dist src/main.ts src/index.ts src/domain.ts
// node dist/main.js`,
      `运行时输出 { id: 'u1', name: 'Ada' }；消费者只需从 index.js 导入公开符号。
失败边界：消费者深导入 domain.js 会把内部文件变成隐式契约；调整目录时即使 index 未变也会破坏调用方。`,
    ),
    tsExample(
      'Result 把预期失败放进返回类型',
      `// src/result.ts
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export function parseAmount(raw: string): Result<number> {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, error: { code: 'INVALID_AMOUNT', message: raw } };
  }
  return { ok: true, value };
}

const parsed = parseAmount('-1');
console.log(parsed.ok ? parsed.value : parsed.error.code);

// npx tsc src/result.ts --strict --noEmit
// node --experimental-strip-types src/result.ts`,
      `输出 INVALID_AMOUNT；调用方在访问 value 前必须先通过 ok 分支收窄。
失败边界：catch 中继续使用 any 会丢掉 code 和 cause；异常入口应保存 unknown 并在边界转换成结构化错误。`,
    ),
    tsExample(
      '硬化清单与真实产物一起验收',
      `// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true, "noImplicitOverride": true,
    "isolatedModules": true, "declaration": true, "outDir": "dist"
  },
  "include": ["src"]
}

// src/index.ts
export const healthy = (values: readonly number[]): boolean =>
  values.every(value => Number.isFinite(value));

// npx tsc -p tsconfig.json
// node -e "import('./dist/index.js').then(m => console.log(m.healthy([1, 2])))"`,
      `构建无诊断，消费者通过动态 import 得到 true；声明和源码映射一并出现。
失败边界：配置变绿但 dist 仍加载旧文件不算通过；发布前应清理产物、重新构建并从包入口执行最小消费者。`,
    ),
  ],
});

Object.assign(typescriptExamples, {
  '单元测试中的类型断言与边界': [
    tsExample(
      '运行时测试与类型测试使用不同证据',
      `// src/parse.ts
export function parseCount(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error('invalid-count');
  return value;
}

// test/parse.test.ts
import { strict as assert } from 'node:assert';
import { parseCount } from '../src/parse.js';
assert.equal(parseCount('3'), 3);
assert.throws(() => parseCount('-1'), /invalid-count/);
console.log('runtime evidence ok');

// npx tsc src/parse.ts test/parse.test.ts --strict --noEmit
// node --experimental-strip-types test/parse.test.ts`,
      `断言通过并输出 runtime evidence ok；类型检查只证明签名匹配，测试证明运行时拒绝负数。
失败边界：用类型断言替代非法输入测试会漏掉真实异常；安全关键边界必须同时有静态签名和动态失败夹具。`,
    ),
    tsExample(
      'expectTypeOf 锁定返回类型和参数',
      `// test/types.test-d.ts
import { expectTypeOf } from 'expect-type';
function normalize(raw: string): { id: string; count: number } {
  return { id: raw, count: 1 };
}
expectTypeOf(normalize).parameter(0).toEqualTypeOf<string>();
expectTypeOf(normalize).returns.toEqualTypeOf<{ id: string; count: number }>();
console.log('signature locked');

// pnpm add -D expect-type
// npx tsc test/types.test-d.ts --strict --noEmit`,
      `类型测试编译通过；若函数改回 string 或返回字段缺失，expectTypeOf 会产生编译错误。
失败边界：expectTypeOf 只在编译时运行，不能验证函数实际返回数据；它必须和运行时测试配套。`,
    ),
    tsExample(
      '@ts-expect-error 证明非法调用会被拒绝',
      `// test/reject.test-d.ts
type Permission = 'read' | 'write';
function requirePermission(permission: Permission): void {
  console.log(permission);
}
requirePermission('read');
// @ts-expect-error delete 不在权限联合中
requirePermission('delete');

// npx tsc test/reject.test-d.ts --strict --noEmit
// 删除 @ts-expect-error 后应出现 TS2345`,
      `带指令时类型检查通过；移除指令后 delete 参数触发 TS2345。
失败边界：如果被测试代码意外允许 delete，@ts-expect-error 会报告“未使用指令”，正好暴露保护失效。`,
    ),
    tsExample(
      '夹具同时覆盖静态形状和动态输入',
      `// test/order.fixture.ts
type Order = { readonly id: string; readonly amountCents: number };
const fixture: Order = { id: 'o-1', amountCents: 500 };
const raw: unknown = JSON.parse(JSON.stringify(fixture));
function parse(value: unknown): Order {
  if (typeof value !== 'object' || value === null) throw new Error('object');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.amountCents !== 'number') throw new Error('shape');
  return { id: row.id, amountCents: row.amountCents };
}
console.log(parse(raw));

// npx tsc test/order.fixture.ts --strict --noEmit
// node --experimental-strip-types test/order.fixture.ts`,
      `输出 { id: 'o-1', amountCents: 500 }；fixture 类型正确，raw 仍从 unknown 开始验证。
失败边界：把 raw 直接 as Order 会让夹具绕过生产解析器；动态数据应从 unknown 进入同一运行时入口。`,
    ),
    tsExample(
      '类型测试接入同一个质量门禁',
      `// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:types": "tsc -p tsconfig.test-types.json --noEmit",
    "check": "pnpm test && pnpm test:types"
  }
}

// tsconfig.test-types.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "types": ["vitest/globals"] },
  "include": ["test/**/*.test-d.ts", "src/**/*.ts"]
}

// pnpm check
// 删掉一条公开导出后再次执行`,
      `完整质量门禁同时运行运行时测试和 .test-d.ts；删除导出后 test:types 返回非零。
失败边界：只在本地编辑器里看到类型错误不算 CI 证据；类型测试文件必须由脚本实际 include。`,
    ),
  ],
  'expect-type 与公开 API 类型测试': [
    tsExample(
      '类型测试只从打包公开入口导入',
      `// test/public-api.test-d.ts
import { expectTypeOf } from 'expect-type';
import type { User, UserId } from '../dist/index.js';
import { parseUser } from '../dist/index.js';

expectTypeOf<User>().toHaveProperty('id');
expectTypeOf<UserId>().toMatchTypeOf<string>();
expectTypeOf(parseUser).returns.not.toBeAny();
console.log('public types loaded');

// pnpm build
// npx tsc test/public-api.test-d.ts --strict --noEmit`,
      `从 dist 的声明入口读取类型，expectTypeOf 无错误并输出 public types loaded。
失败边界：从 src 导入会绕过 package exports；发布包若漏掉子路径，源码测试仍可能全绿。`,
    ),
    tsExample(
      '正向断言检查泛型推断精度',
      `// test/inference.test-d.ts
import { expectTypeOf } from 'expect-type';
function tuple<const T extends readonly unknown[]>(values: T): T { return values; }
const route = tuple(['orders', 'read'] as const);
expectTypeOf(route).toEqualTypeOf<readonly ['orders', 'read']>();
expectTypeOf(route[0]).toEqualTypeOf<'orders'>();
console.log(route[1]);

// npx tsc test/inference.test-d.ts --strict --noEmit
// node --experimental-strip-types test/inference.test-d.ts`,
      `编译通过，运行输出 read；route 的两个槽位字面量都被保留。
失败边界：只断言返回值是 readonly unknown[] 太宽，会漏掉字面量精度；测试应锁定对调用方重要的精度。`,
    ),
    tsExample(
      '负向断言验证拒绝范围',
      `// test/rejections.test-d.ts
import { expectTypeOf } from 'expect-type';
type Status = 'draft' | 'paid';
const status: Status = 'paid';
expectTypeOf(status).toMatchTypeOf<Status>();
// @ts-expect-error unknown 状态不能赋值
const invalid: Status = 'missing';
console.log(status);

// npx tsc test/rejections.test-d.ts --strict --noEmit
// 将 Status 改成 string 后 invalid 分支不再报错，指令也随之失效`,
      `当前版本编译通过，运行时输出 paid；非法状态被明确拒绝。
失败边界：@ts-expect-error 可能因为无关错误而通过；最好让命令行只包含预期诊断，或使用专用类型测试工具报告差异。`,
    ),
    tsExample(
      '独立 tsconfig 管理声明测试环境',
      `// tsconfig.types.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["test/**/*.test-d.ts", "dist/**/*.d.ts"]
}

// test/package.test-d.ts
import type { PackageInfo } from '../dist/index.js';
const value: PackageInfo = { name: 'order-kernel', version: '1.0.0' };
console.log(value.name);

// npx tsc -p tsconfig.types.json`,
      `独立配置只检查声明测试和 dist 声明，不把生产源码当替代入口。
失败边界：types 字段指向错误目录会导致 expect-type 或其他全局声明缺失；类型测试配置应与消费者环境尽量一致。`,
    ),
    tsExample(
      '构建前后各运行一次公开类型测试',
      `// scripts/typecheck-public.mjs
import { execFileSync } from 'node:child_process';
execFileSync('pnpm', ['build'], { stdio: 'inherit' });
execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.types.json'], { stdio: 'inherit' });
console.log('public declarations accepted');

// node scripts/typecheck-public.mjs
// 删除 dist/index.d.ts 后再次运行

// npx tsc src/index.ts --strict --noEmit`,
      `首次构建并检查通过，输出 public declarations accepted；删除声明后脚本在 tsc 步骤失败。
失败边界：只检查源码声明会掩盖构建产物缺失；发布前还要对 tarball 安装后的声明入口做同样检查。`,
    ),
  ],
  'd.ts、declare 与第三方模块': [
    tsExample(
      '声明文件描述形状而实现文件提供行为',
      `// src/greet.ts
export function greet(name: string): string {
  return 'hello ' + name;
}

// dist/greet.d.ts 形式
// export declare function greet(name: string): string;

// src/main.ts
import { greet } from './greet.js';
console.log(greet('Ada'));

// npx tsc src/main.ts src/greet.ts --strict --declaration --outDir dist
// Get-Content dist/greet.d.ts
// node dist/main.js`,
      `声明文件只包含 greet 的公开签名，Node 输出 hello Ada。
失败边界：手写 .d.ts 与实现不一致时 TypeScript 不会反向验证运行时；发布前用消费者测试同时加载声明和实现。`,
    ),
    tsExample(
      '模块增强通过 import 绑定目标模块',
      `// src/logger.ts
export interface Logger { info(message: string): void }
export const logger: Logger = { info: message => console.log(message) };

// src/logger.extend.d.ts
import './logger.js';
declare module './logger.js' {
  interface Logger { error(message: string): void }
}

// src/main.ts
import { logger } from './logger.js';
import './logger.extend.js';
logger.error = message => console.error(message);
logger.error('failed');

// npx tsc src/main.ts src/logger.ts src/logger.extend.d.ts --strict --module NodeNext --noEmit`,
      `增强被包含时 logger.error 可赋值并可调用；缺少 import './logger.js' 时模块增强会失效。
失败边界：声明文件没有进入消费者 include 时类型不可见；增强入口必须由 package types 或 exports 明确暴露。`,
    ),
    tsExample(
      'typeRoots 与 types 控制全局声明来源',
      `// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "types": ["node"],
    "typeRoots": ["./node_modules/@types", "./types"]
  },
  "include": ["src", "types"]
}

// types/global.d.ts
declare const BUILD_HASH: string;

// src/main.ts
console.log(BUILD_HASH);

// npx tsc --showConfig
// npx tsc --noEmit`,
      `showConfig 显示 types 和 typeRoots 的最终值，tsc 能找到 BUILD_HASH。
失败边界：typeRoots 不是文件夹自动扫描开关；未列入 types 的包不会全局加载，过度加载还会污染环境。`,
    ),
    tsExample(
      '缺失声明从解析路径开始诊断',
      `// src/use-client.ts
import Client from 'internal-client';
const client = new Client({ url: 'http://localhost' });
console.log(client.url);

// tsconfig.json
{ "compilerOptions": { "strict": true, "module": "NodeNext",
  "moduleResolution": "NodeNext" }, "include": ["src"] }

// npx tsc --noEmit --traceResolution
// 找不到声明时检查 package exports、types 字段或本地 shim`,
      `缺少声明时报告 TS7016，并提示没有 internal-client 的类型声明；traceResolution 显示解析过的路径。
失败边界：用 declare module 'internal-client' { export ... } 覆盖后仍要验证导出是否真实存在，不能让 shim 比实现更宽。`,
    ),
    tsExample(
      '生成声明后由隔离消费者验收',
      `// package.json
{
  "name": "order-kernel",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist"]
}

// consumer/src/main.ts
import { parseOrder } from 'order-kernel';
console.log(parseOrder({ id: 'o1' }));

// pnpm pack
// npm install ../order-kernel-1.0.0.tgz
// npx tsc consumer/src/main.ts --strict --module NodeNext --noEmit`,
      `tarball 安装在隔离项目后，消费者从 exports 的类型入口解析并编译成功。
失败边界：workspace 符号链接可能掩盖缺失文件；只有安装 tarball 后的 tsc 才能证明声明真正随包发布。`,
    ),
  ],
  'allowJs、checkJs 与增量迁移': [
    tsExample(
      'allowJs 先纳入文件 checkJs 再检查内容',
      `// tsconfig.json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "target": "ES2022",
    "module": "NodeNext"
  },
  "include": ["src"]
}

// src/legacy.js
export function add(left, right) {
  return left + right;
}

// src/main.ts
import { add } from './legacy.js';
console.log(add(1, 2));

// npx tsc && 把 checkJs 改为 true 后再次执行`,
      `allowJs 纳入 legacy.js 后首次通过；checkJs=true 时 add 参数在严格模式下报告隐式 any。
失败边界：只开 allowJs 只表示文件参与项目，不等于检查 JavaScript；迁移必须明确 checkJs 的覆盖范围。`,
    ),
    tsExample(
      'JSDoc 给 JavaScript 提供边界形状',
      `// src/money.js
/**
 * @param {number} cents
 * @returns {{ cents: number, currency: 'CNY' }}
 */
export function money(cents) {
  return { cents, currency: 'CNY' };
}

// src/main.ts
import { money } from './money.js';
const value = money(500);
console.log(value.currency);

// npx tsc src/main.ts src/money.js --allowJs --checkJs --strict --noEmit`,
      `JSDoc 让 money 的返回值保留 currency 字面量，main.ts 可以读取该字段。
失败边界：JSDoc 写得比实现宽会隐藏错误；迁移时应先补参数和返回类型，再逐文件打开 checkJs。`,
    ),
    tsExample(
      '从叶子模块向入口逐层重命名',
      `// 迁移批次示例
// 1. src/lib/format.js -> src/lib/format.ts
// 2. 保持导出名称和调用方式不变
// 3. 运行 tsc 后再迁移 src/services/order.js
// src/lib/format.ts
export function formatOrder(id: string, amount: number): string {
  return id + ':' + amount.toFixed(2);
}

// src/services/order.js
import { formatOrder } from '../lib/format.js';
console.log(formatOrder('o1', 12));

// npx tsc src/services/order.js src/lib/format.ts --allowJs --checkJs --strict --noEmit`,
      `叶子模块先变成 TS，调用方保持相同导出且类型检查通过。
失败边界：从入口开始改名会同时改动大量调用方；从叶子向入口迁移能把每批失败限制在局部并可独立回退。`,
    ),
    tsExample(
      '桥接声明记录临时 JavaScript 契约',
      `// types/legacy-client.d.ts
declare module 'legacy-client' {
  export type ClientOptions = { url: string };
  export default class Client {
    constructor(options: ClientOptions);
    get(url: string): Promise<string>;
  }
}

// src/client.ts
import Client from 'legacy-client';
const client = new Client({ url: 'http://localhost:8080' });
console.log(client instanceof Client);

// npx tsc src/client.ts --strict --module NodeNext --noEmit
// 检查 node_modules/legacy-client 的真实导出与声明是否一致`,
      `桥接声明让客户端代码先通过编译，并清楚列出当前依赖的字段和方法。
失败边界：桥接不能包含实现没有的字段，否则运行时才暴露；临时抑制必须带移除条件和到期版本。`,
    ),
    tsExample(
      '迁移完成以限制撤除和产物可用为证据',
      `// scripts/migration-status.ts
import { readdirSync } from 'node:fs';
const files = readdirSync('src', { recursive: true }).filter(
  file => file.endsWith('.js') || file.endsWith('.jsx'),
);
console.log(JSON.stringify({ uncheckedJsFiles: files.length }));
if (files.length > 0) throw new Error('javascript-remains');

// npx tsc --noEmit
// node --experimental-strip-types scripts/migration-status.ts
// pnpm pack 后在消费者目录运行 typecheck 和 smoke test`,
      `迁移完成时输出 uncheckedJsFiles: 0，tsc 和消费者 smoke test 同时通过。
失败边界：仅删除 allowJs 可能让未导入文件悄悄退出检查；还必须证明 include 不再包含 JavaScript 且打包产物可消费。`,
    ),
  ],
  'Project References 与构建顺序': [
    tsExample(
      'composite 项目生成声明和构建信息',
      `// packages/core/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "module": "NodeNext"
  },
  "include": ["src"]
}

// packages/core/src/index.ts
export const coreVersion = '1.0.0';

// npx tsc -b packages/core/tsconfig.json
// Get-ChildItem packages/core/dist
// Get-ChildItem packages/core/tsconfig.tsbuildinfo`,
      `构建后出现 index.js、index.d.ts 和 tsconfig.tsbuildinfo，composite 项目具备被引用的声明产物。
失败边界：composite 项目不能完全禁用 emit；删除 dist 后若 tsc -b 仍认为最新，需检查 tsbuildinfo 和输入路径。`,
    ),
    tsExample(
      'tsc -b 按引用拓扑构建多包',
      `// packages/app/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "module": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true
  },
  "references": [{ "path": "../core" }],
  "include": ["src"]
}

// packages/app/src/main.ts
import { coreVersion } from '../../core/dist/index.js';
console.log(coreVersion);

// npx tsc -b packages/app/tsconfig.json --verbose
// 修改 core 的导出让 app 类型检查失败`,
      `verbose 日志先构建 core 再构建 app；修改 core 后 app 会重新检查依赖。
失败边界：直接运行单项目 tsc 不会自动构建引用项目；CI 应使用 tsc -b 或先构建明确依赖。`,
    ),
    tsExample(
      'paths 只服务解析不负责构建',
      `// packages/app/tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@core/*": ["../core/src/*"] },
    "module": "NodeNext",
    "strict": true
  },
  "include": ["src"]
}

// packages/app/src/main.ts
import { coreVersion } from '@core/index.js';
console.log(coreVersion);

// npx tsc -p packages/app/tsconfig.json --noEmit
// 删除 paths 后改为通过 workspace 包入口导入`,
      `开发时 paths 让源码解析通过；移除别名后必须依赖 package.json exports 和已构建声明。
失败边界：paths 不会安排 core 先构建，也不会让 Node 在运行时理解别名；它不能替代包依赖。`,
    ),
    tsExample(
      '用冷构建识别陈旧 tsbuildinfo',
      `// PowerShell 中比较增量与冷构建
// npx tsc -b packages/app --verbose
// Get-Item packages/core/tsconfig.tsbuildinfo
// Remove-Item packages/core/dist -Recurse -Force
// Remove-Item packages/core/tsconfig.tsbuildinfo -Force
// npx tsc -b packages/app --verbose

// core 修改后运行
// npx tsc -b packages/app --force`,
      `增量构建读取 tsbuildinfo；清理后冷构建重新生成 core 产物和 app 结果。
失败边界：只删除 dist 不删除 tsbuildinfo 可能让 tsc 认为输出仍最新；CI 必须从干净工作区验证，而不是依赖本地增量状态。`,
    ),
    tsExample(
      '多包构建要求每一层都能失败',
      `// 故意先改坏 packages/core/src/index.ts
// export const coreVersion: number = 'broken';
// 再从根目录执行
// npx tsc -b packages/app/tsconfig.json
// 记录首个失败项目和后续是否继续

// 修复后执行
// npx tsc -b packages/app/tsconfig.json
// npx tsc -b packages/app/tsconfig.json --clean
// npx tsc -b packages/app/tsconfig.json`,
      `坏 core 时构建在 core 报告 TS2322 并返回非零；修复后依赖链通过，clean 再建仍成功。
失败边界：只看最后一个 app 成功无法证明 core 声明可发布；修正一个包后还应验证上层重新编译和消费者入口。`,
    ),
  ],
  '多包仓库中的类型边界': [
    tsExample(
      '公开入口与内部目录由 exports 分开',
      `// packages/contracts/package.json
{
  "name": "@acme/contracts",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist"]
}

// packages/contracts/src/index.ts
export type User = { readonly id: string; readonly name: string };

// packages/app/src/main.ts
import type { User } from '@acme/contracts';
const user: User = { id: 'u1', name: 'Ada' };
console.log(user.name);

// pnpm --filter @acme/contracts build
// npx tsc -p packages/app/tsconfig.json --noEmit`,
      `app 只从包根入口获得 User，编译器解析到 contracts/dist/index.d.ts。
失败边界：IDE 通过 paths 深导入 src 会掩盖发布缺口；消费者夹具必须安装 tarball 并尝试所有公开子路径。`,
    ),
    tsExample(
      'exports 的 types 条件与运行时入口对齐',
      `// package.json
{
  "name": "@acme/order-kernel",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./schema": {
      "types": "./dist/schema.d.ts",
      "import": "./dist/schema.js"
    }
  }
}

// consumer.ts
import { parseOrder } from '@acme/order-kernel';
console.log(parseOrder({ id: 'o1' }));

// npx tsc consumer.ts --strict --module NodeNext --noEmit
// node --input-type=module -e "import('@acme/order-kernel').then(console.log)"`,
      `tsc 从 types 条件加载声明，Node 从 import 条件加载实现，入口都指向 dist。
失败边界：types 指向一个不存在或旧版本的目录时，源码测试可能通过而消费者失败；每个条件都应真实安装验证。`,
    ),
    tsExample(
      '共享契约包只依赖更底层类型',
      `// packages/contracts/src/order.ts
export type OrderStatus = 'draft' | 'paid';
export type OrderDto = { readonly id: string; readonly status: OrderStatus };

// packages/domain/src/order.ts
import type { OrderDto, OrderStatus } from '@acme/contracts';
export type Order = { readonly id: string; readonly status: OrderStatus };
export const fromDto = (dto: OrderDto): Order => ({ id: dto.id, status: dto.status });

// packages/app/src/main.ts
import { fromDto } from '@acme/domain';
console.log(fromDto({ id: 'o1', status: 'paid' }));

// pnpm -r build
// npx tsc -p packages/app/tsconfig.json --noEmit`,
      `依赖方向 contracts <- domain <- app，app 输出 fromDto 的领域对象。
失败边界：contracts 若反向依赖 domain 会造成循环和版本锁死；共享包只能包含稳定传输契约。`,
    ),
    tsExample(
      '跨包运行时值与类型要同时验证',
      `// packages/domain/src/index.ts
export type Order = { readonly id: string; readonly status: 'paid' };
export const isOrder = (value: unknown): value is Order =>
  typeof value === 'object' && value !== null
  && (value as { id?: unknown }).id === 'o1'
  && (value as { status?: unknown }).status === 'paid';

// packages/app/src/main.ts
import { isOrder } from '@acme/domain';
const payload: unknown = JSON.parse('{"id":"o1","status":"paid"}');
console.log(isOrder(payload), payload.id);

// npx tsc packages/app/src/main.ts --strict --module NodeNext --noEmit
// node --experimental-strip-types packages/app/src/main.ts`,
      `isOrder 返回 true 后 payload.id 才能被访问；输出 true o1。
失败边界：monorepo 类型同步不代表运行时对象来自新版本；跨进程和消息队列仍需 guard 或 schema。`,
    ),
    tsExample(
      '隔离消费者夹具验证 tarball 包边界',
      `// consumer/package.json
{
  "name": "consumer-check",
  "type": "module",
  "dependencies": { "@acme/order-kernel": "file:../packs/order-kernel-1.0.0.tgz" }
}

// consumer/src/main.ts
import { parseOrder } from '@acme/order-kernel';
import { OrderSchema } from '@acme/order-kernel/schema';
console.log(parseOrder({ id: 'o1' }), typeof OrderSchema);

// pnpm --filter @acme/order-kernel pack
// pnpm install --dir consumer --frozen-lockfile
// npx tsc -p consumer/tsconfig.json --noEmit
// node consumer/src/main.js`,
      `消费者从 tarball 安装包，主入口和 schema 子路径都能被 tsc 与 Node 加载。
失败边界：workspace 符号链接可能绕过 files 和 exports 缺口；夹具必须记录真实解析路径和安装版本。`,
    ),
  ],
});

Object.assign(typescriptExamples, {
  '请求、响应与领域类型分离': [
    tsExample(
      'DTO 只描述线上字段并保持原始类型',
      `// src/api/dto.ts
type CreateOrderDto = { readonly user_id: string; readonly amount: string };
type Order = { readonly userId: string; readonly amountCents: number };

function toDomain(dto: CreateOrderDto): Order {
  const amountCents = Number(dto.amount);
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amount');
  return { userId: dto.user_id, amountCents };
}
console.log(toDomain({ user_id: 'u1', amount: '1299' }));

// npx tsc src/api/dto.ts --strict --noEmit
// node --experimental-strip-types src/api/dto.ts`,
      `输出 { userId: 'u1', amountCents: 1299 }；snake_case 和字符串金额没有进入领域对象。
失败边界：让领域类型直接复用 DTO 会把传输格式带进业务层；升级字段命名时会同时影响服务和存储。`,
    ),
    tsExample(
      '解析后显式构造领域对象',
      `// src/api/create-order.ts
type Input = { readonly id: unknown; readonly quantity: unknown };
type Order = { readonly id: string; readonly quantity: number };
function parse(input: Input): Order {
  if (typeof input.id !== 'string' || !input.id.startsWith('o-')) throw new Error('id');
  if (typeof input.quantity !== 'number' || input.quantity < 1) throw new Error('quantity');
  return { id: input.id, quantity: input.quantity };
}
console.log(parse({ id: 'o-7', quantity: 2 }));

// npx tsc src/api/create-order.ts --strict --noEmit
// node --experimental-strip-types src/api/create-order.ts`,
      `合法输入输出 { id: 'o-7', quantity: 2 }；错误 id 或数量会抛错。
失败边界：只写 const order = input as Order 不会改变运行时值；领域对象构造函数必须逐字段验证。`,
    ),
    tsExample(
      '日期、金额和标识符在边界完成转换',
      `// src/api/value-convert.ts
type Dto = { id: string; amount: string; created_at: string };
type Order = { id: string; amountCents: number; createdAt: Date };
function fromDto(dto: Dto): Order {
  const amountCents = Math.round(Number(dto.amount) * 100);
  const createdAt = new Date(dto.created_at);
  if (!Number.isFinite(amountCents) || Number.isNaN(createdAt.valueOf())) throw new Error('invalid');
  return { id: dto.id, amountCents, createdAt };
}
console.log(fromDto({ id: 'o1', amount: '12.34', created_at: '2026-01-01T00:00:00Z' }));

// npx tsc src/api/value-convert.ts --strict --noEmit
// node --experimental-strip-types src/api/value-convert.ts`,
      `输出金额 1234 分和 2026-01-01 的 Date；单位与时间类型只在适配层改变。
失败边界：金额直接使用浮点比较会引入精度问题；转换后必须验证有限性与时间有效性，不能只依赖格式约定。`,
    ),
    tsExample(
      '请求向后兼容而响应谨慎增加字段',
      `// src/api/compat.ts
type OldRequest = { page: number };
type NewRequest = { page: number; pageSize?: number };
type ResponseV2 = { items: string[]; total: number };
function serve(request: OldRequest | NewRequest): ResponseV2 {
  const pageSize = 'pageSize' in request ? request.pageSize ?? 20 : 20;
  return { items: ['row-' + request.page], total: 1 + pageSize - 20 };
}
console.log(serve({ page: 1 }));
console.log(serve({ page: 1, pageSize: 2 }));

// npx tsc src/api/compat.ts --strict --noEmit
// node --experimental-strip-types src/api/compat.ts`,
      `旧请求按 pageSize=20 处理，新请求返回 total=2；新增可选字段没有破坏旧调用。
失败边界：响应若直接把内部对象序列化，新增私有字段会泄漏；响应必须经过公开投影和运行时校验。`,
    ),
    tsExample(
      '边界夹具证明 DTO、领域与响应三层分离',
      `// test/boundary.test.ts
import { strict as assert } from 'node:assert';
type Dto = { user_id: string };
type Domain = { userId: string };
type Response = { user_id: string };
const fromDto = (dto: Dto): Domain => ({ userId: dto.user_id });
const toResponse = (domain: Domain): Response => ({ user_id: domain.userId });

assert.deepEqual(fromDto({ user_id: 'u1' }), { userId: 'u1' });
assert.deepEqual(toResponse({ userId: 'u1' }), { user_id: 'u1' });
console.log('boundary roundtrip ok');

// npx tsc test/boundary.test.ts --strict --noEmit
// node --experimental-strip-types test/boundary.test.ts`,
      `断言通过并输出 boundary roundtrip ok；传输字段在两层转换后恢复。
失败边界：只测最终字符串相等会漏掉中间领域对象；夹具应分别断言 DTO、Domain、Response 的字段形状。`,
    ),
  ],
  'Zod/Valibot 运行时解析': [
    tsExample(
      'schema 同时生成运行时验证与静态类型',
      `// src/validation/user.ts
import { z } from 'zod';
const UserSchema = z.object({
  id: z.string().min(2),
  email: z.string().email(),
  active: z.boolean(),
});
type User = z.infer<typeof UserSchema>;
const parsed: User = UserSchema.parse({ id: 'u1', email: 'ada@example.com', active: true });
console.log(parsed);

// pnpm add zod
// npx tsc src/validation/user.ts --strict --noEmit
// node --experimental-strip-types src/validation/user.ts`,
      `输出解析后的对象 { id: 'u1', email: 'ada@example.com', active: true }。
失败边界：z.infer 只描述成功 schema，不会替未经过 parse 的任意对象背书；入口必须真的调用 schema。`,
    ),
    tsExample(
      'safeParse 保留字段路径而不是抛异常',
      `// src/validation/safe.ts
import { z } from 'zod';
const Schema = z.object({ id: z.string(), amount: z.number().positive() });
const result = Schema.safeParse({ id: 'o1', amount: -3 });
if (!result.success) {
  console.log(result.error.issues.map(issue => issue.path.join('.') + ':' + issue.code));
} else {
  console.log(result.data);
}

// npx tsc src/validation/safe.ts --strict --noEmit
// node --experimental-strip-types src/validation/safe.ts`,
      `输出 [ 'amount:too_small' ]；失败结果保留字段路径和 issue code。
失败边界：只记录 error.message 会丢掉路径；API 边界应把 issue 映射为稳定字段错误，而不是把内部对象直接返回。`,
    ),
    tsExample(
      'transform 与 refine 先转换再建立业务约束',
      `// src/validation/money.ts
import { z } from 'zod';
const Money = z.string()
  .transform(value => Number(value))
  .refine(value => Number.isInteger(value) && value > 0, 'positive-integer');
const parsed = Money.safeParse('1299');
console.log(parsed.success ? parsed.data : parsed.error.issues[0].message);
console.log(Money.safeParse('12.5').success);

// npx tsc src/validation/money.ts --strict --noEmit
// node --experimental-strip-types src/validation/money.ts`,
      `合法输入输出 1299，12.5 返回 false；转换后检查整数和正数。
失败边界：transform 抛出的普通异常不会自动变成 issue；复杂转换应使用 ctx.addIssue 或 try/catch 转成结构化错误。`,
    ),
    tsExample(
      '判别联合与跨字段约束一起验证',
      `// src/validation/event.ts
import { z } from 'zod';
const Event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('created'), id: z.string() }),
  z.object({ type: z.literal('failed'), id: z.string(), reason: z.string().min(1) }),
]).refine(value => value.id.length > 1, { path: ['id'], message: 'id-too-short' });
console.log(Event.safeParse({ type: 'failed', id: 'a', reason: 'timeout' }).success);

// npx tsc src/validation/event.ts --strict --noEmit
// node --experimental-strip-types src/validation/event.ts`,
      `输出 false；discriminatedUnion 识别 failed 分支，refine 再拒绝长度不足的 id。
失败边界：跨字段 refine 放在联合外层才能访问完整对象；放在单个分支内会漏掉其他状态。`,
    ),
    tsExample(
      'schema 版本与 strictness 进入依赖变更评审',
      `// src/validation/config.ts
import { z } from 'zod';
const Config = z.object({ host: z.string(), port: z.number().int() }).strict();
const result = Config.safeParse({ host: 'localhost', port: 3000, extra: true });
console.log(result.success, result.success ? {} : result.error.issues[0].code);

// pnpm list zod
// npx tsc src/validation/config.ts --strict --noEmit
// node --experimental-strip-types src/validation/config.ts`,
      `输出 false 与 unrecognized_keys；strict schema 拒绝未知配置键。
失败边界：升级 Zod 主版本可能改变错误码和 API；依赖升级必须跑 schema 夹具，并检查未知键是拒绝还是保留。`,
    ),
  ],
  'OpenAPI 契约与客户端生成': [
    tsExample(
      'OpenAPI 3.1 用 JSON Schema 表达可空金额',
      `// openapi.yaml 对应的对象定义
{
  "openapi": "3.1.0",
  "paths": {
    "/orders": {
      "post": {
        "requestBody": { "required": true },
        "responses": { "201": { "description": "created" } }
      }
    }
  },
  "components": { "schemas": {
    "CreateOrder": {
      "type": "object", "required": ["amountCents"],
      "properties": { "amountCents": { "type": ["integer", "null"] } }
    }
  }}
}

// npx @redocly/cli lint openapi.yaml
// node -e "const s=require('./openapi.json'); console.log(s.openapi)"`,
      `lint 无错误，脚本输出 3.1.0；金额用 type 数组表达 integer 或 null。
失败边界：在 3.1 中继续使用 nullable 字段可能被部分工具误读；发布前用实际使用的生成器 lint 和生成验证。`,
    ),
    tsExample(
      '生成类型与运行时校验分工明确',
      `// 生成命令
// npx openapi-typescript openapi.yaml -o src/generated/api.d.ts
// src/handlers/create.ts
import type { components } from '../generated/api.js';
type Dto = components['schemas']['CreateOrder'];
function parse(raw: unknown): Dto {
  if (typeof raw !== 'object' || raw === null) throw new Error('body');
  const amount = (raw as { amountCents?: unknown }).amountCents;
  if (typeof amount !== 'number' || amount <= 0) throw new Error('amount');
  return { amountCents: amount };
}
console.log(parse({ amountCents: 500 }));

// npx tsc src/handlers/create.ts --strict --noEmit`,
      `解析合法值输出 { amountCents: 500 }；生成类型提供字段名称，手写守卫验证运行时值。
失败边界：生成 .d.ts 不会自动验证请求体；客户端类型与服务端 schema 不一致时，仍可能在网络边界失败。`,
    ),
    tsExample(
      '契约优先先改 schema 再生成消费者',
      `// scripts/check-contract.ts
import { readFileSync } from 'node:fs';
const spec = JSON.parse(readFileSync('openapi.json', 'utf8')) as {
  paths: Record<string, unknown>;
};
const routes = Object.keys(spec.paths);
if (!routes.includes('/orders')) throw new Error('missing /orders');
console.log('contract routes:', routes.length);

// npx @redocly/cli lint openapi.yaml
// npx openapi-typescript openapi.yaml -o src/generated/api.d.ts
// node --experimental-strip-types scripts/check-contract.ts`,
      `脚本输出 contract routes: 1，生成声明更新，lint 通过。
失败边界：如果先生成客户端再回头改接口，已有消费者可能已经按旧字段提交；契约变更必须先进入 schema 评审。`,
    ),
    tsExample(
      '识别删除字段与收紧类型的破坏',
      `// scripts/diff-contract.ts
type Schema = { required: string[]; properties: Record<string, { type: string }> };
const before: Schema = { required: ['id', 'amount'], properties: { id: { type: 'string' }, amount: { type: 'integer' } } };
const after: Schema = { required: ['id'], properties: { id: { type: 'string' } } };
const removed = Object.keys(before.properties).filter(key => !(key in after.properties));
console.log(removed.join(','));

// node --experimental-strip-types scripts/diff-contract.ts
// 把输出接入 CI，删除字段时返回非零退出码`,
      `输出 amount；删除响应字段或必填项属于破坏性变化，需要主版本或兼容窗口。
失败边界：只看新增字段会误判兼容性；从 required 删除和 enum 收紧也可能破坏旧请求，应分别检查方向。`,
    ),
    tsExample(
      '契约漂移纳入 lint 与消费者生成门禁',
      `// package.json scripts
{
  "contract:lint": "redocly lint openapi.yaml",
  "contract:types": "openapi-typescript openapi.yaml -o src/generated/api.d.ts",
  "contract:check": "git diff --exit-code src/generated/api.d.ts",
  "typecheck": "tsc --noEmit"
}

// CI 顺序
// pnpm contract:lint
// pnpm contract:types
// pnpm contract:check
// pnpm typecheck

// 手动制造 schema 与生成文件不一致后重跑`,
      `干净状态下四个命令返回 0；手改生成声明后 contract:check 返回非零并阻止合并。
失败边界：生成文件未提交时 diff 检查会把正常生成当成漂移；应根据团队策略固定生成产物或只在 CI 生成。`,
    ),
  ],
  '错误码、结果类型与异常边界': [
    tsExample(
      '预期失败用 Result 返回而不是抛异常',
      `// src/result/parse.ts
type Failure = { readonly ok: false; readonly code: 'EMPTY' | 'TOO_LONG' };
type Success = { readonly ok: true; readonly value: string };
function parseName(raw: string): Success | Failure {
  if (raw.trim().length === 0) return { ok: false, code: 'EMPTY' };
  if (raw.length > 20) return { ok: false, code: 'TOO_LONG' };
  return { ok: true, value: raw.trim() };
}
console.log(parseName(' Ada '), parseName('   '));

// npx tsc src/result/parse.ts --strict --noEmit
// node --experimental-strip-types src/result/parse.ts`,
      `输出成功结果 { ok: true, value: 'Ada' } 和失败 { ok: false, code: 'EMPTY' }。
失败边界：把验证失败和网络异常混在一起会让调用方难以决定重试；可预期失败应进入稳定结果类型。`,
    ),
    tsExample(
      '错误码映射成稳定协议',
      `// src/result/codes.ts
const codes = {
  EMPTY: { status: 400, retryable: false },
  TIMEOUT: { status: 504, retryable: true },
} as const;
type Code = keyof typeof codes;
function response(code: Code): { status: number; retryable: boolean } {
  return codes[code];
}
console.log(response('EMPTY'), response('TIMEOUT'));

// npx tsc src/result/codes.ts --strict --noEmit
// node --experimental-strip-types src/result/codes.ts`,
      `EMPTY 映射为 400 不可重试，TIMEOUT 映射为 504 可重试；协议由表统一维护。
失败边界：直接将异常文本作为 error code 会随版本变化；对外协议应使用稳定枚举，并在日志中保留原始 cause。`,
    ),
    tsExample(
      'catch unknown 保留异常链再分类',
      `// src/result/catch.ts
function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch (error: unknown) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error('INVALID_JSON: ' + cause, { cause: error });
  }
}
try { parseJson('{'); }
catch (error) {
  console.log(error instanceof Error ? error.message : 'unknown');
  console.log(error instanceof Error && error.cause ? 'has-cause' : 'no-cause');
}

// npx tsc src/result/catch.ts --strict --noEmit
// node --experimental-strip-types src/result/catch.ts`,
      `输出 INVALID_JSON: ... 和 has-cause；原始异常被保留在 cause 中。
失败边界：catch (error: any) 会掩盖抛出字符串或对象的情况；未知异常必须先判断类型再读取 message。`,
    ),
    tsExample(
      'schema 错误映射成字段路径数组',
      `// src/result/field-errors.ts
type Issue = { path: readonly string[]; code: string };
const issues: Issue[] = [
  { path: ['amount'], code: 'TOO_SMALL' },
  { path: ['customer', 'email'], code: 'INVALID_EMAIL' },
];
const fields = issues.map(issue => ({
  field: issue.path.join('.'),
  code: issue.code,
}));
console.log(fields);

// npx tsc src/result/field-errors.ts --strict --noEmit
// node --experimental-strip-types src/result/field-errors.ts`,
      `输出 [ { field: 'amount', code: 'TOO_SMALL' }, { field: 'customer.email', code: 'INVALID_EMAIL' } ]。
失败边界：只返回 schema 的 issue 对象会泄漏库内部结构；应投影为稳定的字段错误协议并限制敏感信息。`,
    ),
    tsExample(
      'Result 分支穷尽并携带请求关联 ID',
      `// src/result/request.ts
type Outcome =
  | { ok: true; requestId: string; value: number }
  | { ok: false; requestId: string; code: string };
function report(outcome: Outcome): string {
  if (outcome.ok) return outcome.requestId + ':ok:' + outcome.value;
  return outcome.requestId + ':error:' + outcome.code;
}
console.log(report({ ok: true, requestId: 'r1', value: 2 }));
console.log(report({ ok: false, requestId: 'r2', code: 'TIMEOUT' }));

// npx tsc src/result/request.ts --strict --noEmit
// node --experimental-strip-types src/result/request.ts`,
      `输出 r1:ok:2 和 r2:error:TIMEOUT；两个分支都保留同一请求关联 ID。
失败边界：新增加载或取消分支后必须更新报告逻辑；否则类型检查会提示缺少字段或返回路径。`,
    ),
  ],
  '版本兼容与弃用策略': [
    tsExample(
      '按消费者编译影响分类版本变化',
      `// scripts/semver.ts
type ApiChange = 'added-optional' | 'added-required' | 'removed';
function bump(change: ApiChange): 'minor' | 'major' {
  return change === 'added-optional' ? 'minor' : 'major';
}
console.log(['added-optional', 'added-required', 'removed'].map(bump));

// node --experimental-strip-types scripts/semver.ts
// 将改动清单写入 release notes 并与 api-report diff 对照`,
      `输出 [ 'minor', 'major', 'major' ]；新增必填字段和删除导出都需要主版本。
失败边界：运行时仍可接受旧值不代表类型兼容；消费者 tsc 失败同样属于破坏性变更。`,
    ),
    tsExample(
      'JSDoc deprecated 在编辑器提示迁移',
      `// src/api/user.ts
export type User = { readonly id: string; readonly displayName: string };
/** @deprecated 使用 displayName。将在 v3 移除。 */
export function userName(user: User): string {
  return user.displayName;
}
export function displayName(user: User): string {
  return user.displayName;
}
console.log(displayName({ id: 'u1', displayName: 'Ada' }));

// npx tsc src/api/user.ts --strict --declaration --outDir dist
// Get-Content dist/user.d.ts`,
      `声明文件保留 deprecated 注释，编辑器对 userName 显示删除线；运行输出 Ada。
失败边界：JSDoc 只提供提示，不会阻止调用；删除前仍需统计调用量并提供兼容入口和主版本窗口。`,
    ),
    tsExample(
      '运行时弃用告警只发送一次',
      `// src/api/deprecated.ts
let warned = false;
function warnOnce(code: string): void {
  if (warned) return;
  warned = true;
  console.warn('deprecated:' + code);
}
export function legacyTotal(values: readonly number[]): number {
  warnOnce('legacyTotal');
  return values.reduce((sum, value) => sum + value, 0);
}
console.log(legacyTotal([1, 2]), legacyTotal([3, 4]));

// npx tsc src/api/deprecated.ts --strict --noEmit
// node --experimental-strip-types src/api/deprecated.ts`,
      `两次调用分别输出 3 和 7，但控制台只出现一次 deprecated:legacyTotal。
失败边界：每次调用都告警会淹没日志；真正迁移还需要版本标签、调用来源或指标，而不是只打印文本。`,
    ),
    tsExample(
      '兼容别名只保留一个实现',
      `// src/api/names.ts
type User = { readonly id: string; readonly givenName: string };
export function getGivenName(user: User): string { return user.givenName; }
/** @deprecated 使用 getGivenName。 */
export function getName(user: User): string { return getGivenName(user); }
const user = { id: 'u1', givenName: 'Ada' } as const;
console.log(getName(user) === getGivenName(user));

// npx tsc src/api/names.ts --strict --noEmit
// node --experimental-strip-types src/api/names.ts`,
      `输出 true；旧入口委托给新入口，没有复制第二套业务逻辑。
失败边界：适配层如果偷偷改变默认值或异常类型，会造成旧新入口行为分叉；对拍测试必须覆盖边界输入。`,
    ),
    tsExample(
      '删除 API 前建立消费者矩阵',
      `// scripts/consumer-matrix.ts
const consumers = [
  { name: 'web', version: '1.4.0', imports: ['getName'] },
  { name: 'mobile', version: '2.0.0', imports: ['getGivenName'] },
];
const legacy = consumers.filter(consumer => consumer.imports.includes('getName'));
console.log(JSON.stringify({ total: consumers.length, legacy: legacy.length }));
if (legacy.length > 0) throw new Error('legacy-consumer-remains');

// node --experimental-strip-types scripts/consumer-matrix.ts
// 在 CI 的不同消费者工作区分别运行 tsc 与测试`,
      `迁移完成前脚本报告 legacy: 1 并返回非零；全部升级后不再抛错。
失败边界：只在主仓库搜索字符串会漏掉外部消费者；矩阵应包含实际安装版本、入口和最低 TypeScript 版本。`,
    ),
  ],
  '不可信输入端到端实验': [
    tsExample(
      '入口先限制请求体大小',
      `// src/http/size.ts
import { createServer } from 'node:http';
const server = createServer((request, response) => {
  let size = 0;
  request.on('data', chunk => {
    size += chunk.length;
    if (size > 1024) request.destroy(new Error('body-too-large'));
  });
  request.on('end', () => response.end('bytes=' + size));
});
server.listen(0, () => {
  console.log('limit=1024');
  server.close();
});

// npx tsc src/http/size.ts --strict --noEmit
// node --experimental-strip-types src/http/size.ts`,
      `启动后输出 limit=1024；超过限制的请求会销毁连接，避免无限缓冲。
失败边界：只在 JSON.parse 之后检查大小已经太晚，进程可能先被大包耗尽内存；还要设置读取超时和速率限制。`,
    ),
    tsExample(
      'Schema 结构校验通过后仍可能有业务非法',
      `// src/http/structure.ts
type Raw = unknown;
function parseBody(raw: Raw): { amount: number } {
  if (typeof raw !== 'object' || raw === null) throw new Error('body');
  const amount = (raw as { amount?: unknown }).amount;
  if (typeof amount !== 'number') throw new Error('shape');
  return { amount };
}
const value = parseBody({ amount: -5 });
console.log(value.amount, value.amount > 0 ? 'business-ok' : 'business-reject');

// npx tsc src/http/structure.ts --strict --noEmit
// node --experimental-strip-types src/http/structure.ts`,
      `输出 -5 business-reject；结构解析允许数字，但业务规则拒绝负数金额。
失败边界：把结构校验当成授权或业务校验会让负金额、越权租户继续执行；需要独立的应用层规则。`,
    ),
    tsExample(
      '领域转换与副作用在执行前分开',
      `// src/http/order.ts
type Input = unknown;
type Order = { readonly userId: string; readonly amountCents: number };
function parse(input: Input): Order {
  if (typeof input !== 'object' || input === null) throw new Error('body');
  const row = input as Record<string, unknown>;
  if (typeof row.userId !== 'string' || typeof row.amountCents !== 'number') throw new Error('shape');
  if (!Number.isInteger(row.amountCents) || row.amountCents <= 0) throw new Error('amount');
  return { userId: row.userId, amountCents: row.amountCents };
}
const order = parse({ userId: 'u1', amountCents: 500 });
console.log('ready:' + order.userId);
// 只有 console.log 之后才进入数据库写入或消息发送

// npx tsc src/http/order.ts --strict --noEmit`,
      `输出 ready:u1；对象通过全部检查后才到达副作用边界。
失败边界：先写数据库再验证会在错误请求上产生部分状态；所有写操作应放在完整解析和授权之后。`,
    ),
    tsExample(
      '输出投影删除内部字段并脱敏错误',
      `// src/http/response.ts
type Internal = { id: string; email: string; token: string };
function publicView(row: Internal): { id: string; emailMasked: string } {
  return { id: row.id, emailMasked: row.email.replace(/(^.).*(@.*$)/, '$1***$2') };
}
console.log(publicView({ id: 'u1', email: 'ada@example.com', token: 'secret' }));

// npx tsc src/http/response.ts --strict --noEmit
// node --experimental-strip-types src/http/response.ts`,
      `输出 { id: 'u1', emailMasked: 'a***@example.com' }，token 没有进入响应。
失败边界：直接 res.json(row) 会泄漏字段；错误对象也要只返回稳定 code，不能把堆栈和密钥写入客户端。`,
    ),
    tsExample(
      '端到端夹具同时验证拒绝与成功',
      `// test/input-e2e.ts
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
type Body = { amount?: unknown };
const server = createServer((request, response) => {
  if (request.method !== 'POST') { response.statusCode = 405; response.end(); return; }
  let raw = '';
  request.on('data', chunk => { raw += chunk; });
  request.on('end', () => {
    try {
      const body = JSON.parse(raw) as Body;
      if (typeof body.amount !== 'number' || body.amount <= 0) throw new Error('amount');
      response.end('accepted');
    } catch { response.statusCode = 400; response.end('rejected'); }
  });
});
server.listen(0, () => {
  assert.ok(server.listening);
  console.log('request validation matrix ready');
  server.close();
});

// npx tsc test/input-e2e.ts --strict --noEmit`,
      `服务启动并打印 request validation matrix ready，拒绝分支保留 400 状态。
失败边界：只测函数级 schema 不能证明 HTTP 入口真的调用它；端到端夹具必须经过网络、方法和响应投影。`,
    ),
  ],
});

Object.assign(typescriptExamples, {
  '实体、值对象与标识符类型': [
    tsExample(
      '实体按身份比较而值对象按内容比较',
      `// src/domain/order.ts
type OrderId = { readonly value: string };
type Money = { readonly cents: number; readonly currency: 'CNY' };

function sameOrder(left: OrderId, right: OrderId): boolean {
  return left.value === right.value;
}
function sameMoney(left: Money, right: Money): boolean {
  return left.cents === right.cents && left.currency === right.currency;
}

console.log(sameOrder({ value: 'o1' }, { value: 'o1' }));
console.log(sameMoney({ cents: 100, currency: 'CNY' }, { cents: 100, currency: 'CNY' }));

// npx tsc src/domain/order.ts --strict --noEmit
// node --experimental-strip-types src/domain/order.ts`,
      `两次比较都输出 true；订单身份由 id 决定，金额值对象由内容决定。
失败边界：用对象引用相等比较 OrderId 会把同一订单的两个请求对象判成不同；必须统一使用领域相等函数。`,
    ),
    tsExample(
      '品牌类型阻止用户 ID 与订单 ID 互换',
      `// src/domain/brand.ts
type Brand<T, Name extends string> = T & { readonly __brand: Name };
type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;
const asUserId = (value: string): UserId => value as UserId;
const asOrderId = (value: string): OrderId => value as OrderId;

function loadUser(id: UserId): string { return 'user:' + id; }
const user = asUserId('u-1');
const order = asOrderId('o-1');
console.log(loadUser(user));
// loadUser(order); // TS2345

// npx tsc src/domain/brand.ts --strict --noEmit
// node --experimental-strip-types src/domain/brand.ts`,
      `程序输出 user:u-1；OrderId 不能赋给 UserId，即使运行时两者都是字符串。
失败边界：类型断言可以伪造品牌，入口必须把原始字符串经过验证后只在一处生成品牌值。`,
    ),
    tsExample(
      '构造函数建立金额非负与币种不变式',
      `// src/domain/money.ts
type Money = { readonly cents: number; readonly currency: 'CNY' | 'USD' };

function createMoney(cents: number, currency: Money['currency']): Money {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('invalid-cents');
  if (currency !== 'CNY' && currency !== 'USD') throw new Error('invalid-currency');
  return Object.freeze({ cents, currency });
}

console.log(createMoney(1990, 'CNY'));
try { createMoney(-1, 'CNY'); } catch (error) {
  console.log(error instanceof Error ? error.message : 'unknown');
}

// npx tsc src/domain/money.ts --strict --noEmit
// node --experimental-strip-types src/domain/money.ts`,
      `输出冻结的 1990 CNY 金额，第二次构造抛出 invalid-cents。
失败边界：只在类型层写 number 无法阻止负数、小数或 NaN；所有外部金额都必须经过同一个构造函数。`,
    ),
    tsExample(
      'readonly 只保护当前层引用',
      `// src/domain/readonly.ts
type Address = { city: string };
type User = { readonly id: string; readonly address: Address };
const user: User = { id: 'u1', address: { city: 'Shanghai' } };
user.address.city = 'Beijing';
console.log(user.id, user.address.city);
// user.id = 'u2'; // TS2540

// npx tsc src/domain/readonly.ts --strict --noEmit
// node --experimental-strip-types src/domain/readonly.ts`,
      `输出 u1 Beijing；address 属性不能重新赋值，但嵌套 city 仍可被修改。
失败边界：浅 readonly 不代表深不可变；需要深不可变时应定义 DeepReadonly 或在更新入口创建新快照。`,
    ),
    tsExample(
      '围绕身份与不变式编写实体测试',
      `// src/domain/user.ts
type User = { readonly id: string; readonly email: string };
export function createUser(id: string, email: string): User {
  if (!id.startsWith('u-')) throw new Error('invalid-id');
  if (!email.includes('@')) throw new Error('invalid-email');
  return { id, email };
}

const left = createUser('u-1', 'ada@example.com');
const right = createUser('u-1', 'lin@example.com');
console.log(left.id === right.id, left.email === right.email);

// npx tsc src/domain/user.ts --strict --noEmit
// node --experimental-strip-types src/domain/user.ts`,
      `输出 true false；同一 id 代表同一实体，但邮箱内容可以不同。
失败边界：只测 happy path 会漏掉 id 前缀和邮箱不变式；测试至少覆盖构造成功、两个失败分支和身份相等。`,
    ),
  ],
  '判别联合与状态机': [
    tsExample(
      '每个订单状态只携带合法载荷',
      `// src/order/state.ts
type OrderState =
  | { kind: 'draft'; lines: readonly string[] }
  | { kind: 'paid'; lines: readonly string[]; paymentId: string }
  | { kind: 'cancelled'; reason: string };

function heading(state: OrderState): string {
  switch (state.kind) {
    case 'draft': return 'draft:' + state.lines.length;
    case 'paid': return 'paid:' + state.paymentId;
    case 'cancelled': return 'cancelled:' + state.reason;
  }
}

console.log(heading({ kind: 'paid', lines: ['o1'], paymentId: 'p1' }));

// npx tsc src/order/state.ts --strict --noEmit
// node --experimental-strip-types src/order/state.ts`,
      `输出 paid:p1；cancelled 状态不能伪造 paymentId，paid 状态必须提供它。
失败边界：把所有字段都设为可选会让每条分支都能访问不属于自己的数据；状态载荷应随 kind 分开声明。`,
    ),
    tsExample(
      '迁移表限制允许的状态关系',
      `// src/order/transitions.ts
type Status = 'draft' | 'paid' | 'shipped' | 'cancelled';
const allowed: Record<Status, readonly Status[]> = {
  draft: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: [],
};

function canMove(from: Status, to: Status): boolean {
  return allowed[from].includes(to);
}

console.log(canMove('draft', 'paid'), canMove('shipped', 'draft'));

// npx tsc src/order/transitions.ts --strict --noEmit
// node --experimental-strip-types src/order/transitions.ts`,
      `输出 true false；迁移表是运行时事实来源，类型保证所有状态都有表项。
失败边界：只检查 from 是合法状态并不能保证迁移合法；应在服务入口调用 canMove 并拒绝非法边。`,
    ),
    tsExample(
      '命令携带迁移目标状态所需数据',
      `// src/order/commands.ts
type Order = { readonly id: string; readonly status: 'draft' | 'paid' };
type Command =
  | { type: 'pay'; paymentId: string }
  | { type: 'cancel'; reason: string };

function apply(order: Order, command: Command): Order {
  if (order.status !== 'draft') throw new Error('closed-order');
  if (command.type === 'pay') return { ...order, status: 'paid' };
  if (command.reason.length === 0) throw new Error('reason-required');
  return order;
}

console.log(apply({ id: 'o1', status: 'draft' }, { type: 'pay', paymentId: 'p1' }));

// npx tsc src/order/commands.ts --strict --noEmit
// node --experimental-strip-types src/order/commands.ts`,
      `输出 { id: 'o1', status: 'paid' }；pay 命令必须携带 paymentId，cancel 必须携带 reason。
失败边界：命令类型只描述输入形状，不能替代订单当前状态检查；非法迁移仍需运行时拒绝。`,
    ),
    tsExample(
      '纯迁移返回新快照而不修改原状态',
      `// src/order/snapshot.ts
type Snapshot = { readonly version: number; readonly status: 'draft' | 'paid' };
type Event = { type: 'pay'; paymentId: string };

function reduce(state: Snapshot, event: Event): Snapshot {
  if (state.status === 'paid') return state;
  return Object.freeze({ version: state.version + 1, status: 'paid' });
}

const before = Object.freeze({ version: 1, status: 'draft' as const });
const after = reduce(before, { type: 'pay', paymentId: 'p1' });
console.log(before, after, before === after);

// npx tsc src/order/snapshot.ts --strict --noEmit
// node --experimental-strip-types src/order/snapshot.ts`,
      `before 仍是 draft，after 是 paid，最后输出 false；同一输入状态没有被原地改写。
失败边界：直接修改 state.status 会让历史快照和重放结果失真；事件处理应返回新对象或明确的不变结果。`,
    ),
    tsExample(
      '状态机样例覆盖合法边和非法边',
      `// src/order/machine.test.ts
import { strict as assert } from 'node:assert';
type State = 'draft' | 'paid' | 'cancelled';
const moves: Record<State, readonly State[]> = {
  draft: ['paid', 'cancelled'], paid: [], cancelled: [],
};
const canMove = (from: State, to: State): boolean => moves[from].includes(to);

assert.equal(canMove('draft', 'paid'), true);
assert.equal(canMove('paid', 'draft'), false);
assert.equal(canMove('cancelled', 'paid'), false);
console.log('machine matrix ok');

// npx tsc src/order/machine.test.ts --strict --noEmit
// node --experimental-strip-types src/order/machine.test.ts`,
      `断言全部通过并输出 machine matrix ok；合法边和非法边都有行为证据。
失败边界：只覆盖 happy path 无法发现回退边；测试至少遍历每个状态的允许集合，并验证一个拒绝分支。`,
    ),
  ],
  '只读结构、不可变更新与差异': [
    tsExample(
      'DeepReadonly 阻止嵌套字段写入',
      `// src/immutable/deep.ts
type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

type User = { name: string; address: { city: string } };
const user: DeepReadonly<User> = { name: 'Ada', address: { city: 'Shanghai' } };
console.log(user.address.city);
// user.address.city = 'Beijing'; // TS2540

// npx tsc src/immutable/deep.ts --strict --noEmit
// node --experimental-strip-types src/immutable/deep.ts`,
      `程序输出 Shanghai；编译期禁止修改 address.city。
失败边界：DeepReadonly 只是类型投影，运行时对象仍可被不经过该类型的代码改写；安全边界需要冻结或所有权约定。`,
    ),
    tsExample(
      '对象展开只复制被修改路径',
      `// src/immutable/update.ts
type User = { id: string; name: string; address: { city: string; zip: string } };
const before: User = { id: 'u1', name: 'Ada', address: { city: 'Shanghai', zip: '200000' } };
const after: User = { ...before, address: { ...before.address, city: 'Beijing' } };

console.log(before.address.city, after.address.city);
console.log(before.address === after.address);

// npx tsc src/immutable/update.ts --strict --noEmit
// node --experimental-strip-types src/immutable/update.ts`,
      `输出 Shanghai Beijing false；被修改的 address 被复制，其他字段仍可共享引用。
失败边界：漏掉一层展开会保留旧引用并导致后续更新互相污染；每次更新必须只替换目标路径。`,
    ),
    tsExample(
      '只读数组用过滤和映射生成新数组',
      `// src/immutable/array.ts
type Item = { readonly id: string; readonly done: boolean };
const items: readonly Item[] = [
  { id: 'a', done: false }, { id: 'b', done: true },
];

const completed = items.filter(item => item.done).map(item => item.id);
const marked = items.map(item => item.id === 'a' ? { ...item, done: true } : item);
console.log(completed.join(','), marked[0].done, items[0].done);

// npx tsc src/immutable/array.ts --strict --noEmit
// node --experimental-strip-types src/immutable/array.ts`,
      `输出 b true false；原数组仍保持 a 未完成，过滤和映射产生新结果。
失败边界：在 map 中直接修改 item.done 会共享原对象；不可变更新必须返回替换对象并保留旧快照。`,
    ),
    tsExample(
      '嵌套更新封装成领域动作',
      `// src/immutable/cart.ts
type Cart = { readonly id: string; readonly lines: readonly { sku: string; qty: number }[] };
function setQuantity(cart: Cart, sku: string, qty: number): Cart {
  if (!Number.isInteger(qty) || qty < 0) throw new Error('invalid-qty');
  return { ...cart, lines: cart.lines.map(line => line.sku === sku ? { ...line, qty } : line) };
}

const before: Cart = { id: 'c1', lines: [{ sku: 'a', qty: 1 }] };
const after = setQuantity(before, 'a', 3);
console.log(before.lines[0].qty, after.lines[0].qty);

// npx tsc src/immutable/cart.ts --strict --noEmit
// node --experimental-strip-types src/immutable/cart.ts`,
      `输出 1 3；setQuantity 不修改原购物车，并拒绝负数和非整数数量。
失败边界：在组件或处理器里反复手写展开容易漏层；把更新封装为有名称的领域动作能集中不变式。`,
    ),
    tsExample(
      '差异比较要报告变化字段而非克隆整个对象',
      `// src/immutable/diff.ts
type User = { readonly name: string; readonly city: string; readonly active: boolean };
function diff(before: User, after: User): string[] {
  return (Object.keys(before) as (keyof User)[])
    .filter(key => before[key] !== after[key]);
}

const before: User = { name: 'Ada', city: 'Shanghai', active: true };
const after: User = { ...before, city: 'Beijing' };
console.log(diff(before, after));

// npx tsc src/immutable/diff.ts --strict --noEmit
// node --experimental-strip-types src/immutable/diff.ts`,
      `输出 [ 'city' ]；diff 只指出发生变化的字段。
失败边界：把深层对象直接放进差异结果会复制引用，后续更新可能改变历史；差异应保存值或稳定快照。`,
    ),
  ],
  '穷尽检查与 never 分支': [
    tsExample(
      'never 表示没有剩余可命中的值',
      `// src/exhaustive/never.ts
type State = 'idle' | 'ready';
function label(state: State): string {
  if (state === 'idle') return 'IDLE';
  if (state === 'ready') return 'READY';
  const impossible: never = state;
  return impossible;
}

console.log(label('idle'), label('ready'));

// npx tsc src/exhaustive/never.ts --strict --noEmit
// node --experimental-strip-types src/exhaustive/never.ts`,
      `输出 IDLE READY；两个分支覆盖后 state 的类型为空集，赋给 never 合法。
失败边界：给 State 增加 busy 而忘记分支时，赋值给 never 会立即报错，不会默默返回 undefined。`,
    ),
    tsExample(
      'assertNever 集中报告遗漏分支',
      `// src/exhaustive/assert-never.ts
type Event = { type: 'created' } | { type: 'deleted' };
function assertNever(value: never): never {
  throw new Error('unhandled: ' + JSON.stringify(value));
}
function handle(event: Event): string {
  return event.type === 'created' ? 'created'
    : event.type === 'deleted' ? 'deleted'
      : assertNever(event);
}

console.log(handle({ type: 'created' }));
// 新增 archive 类型但不处理时，assertNever 参数会报错

// npx tsc src/exhaustive/assert-never.ts --strict --noEmit`,
      `输出 created；当前联合已被前两个分支耗尽。
失败边界：assertNever 不是运行时万能兜底；如果输入未经验证包含伪造类型，JSON 分支仍可能抛 unhandled。`,
    ),
    tsExample(
      '从 as const 元组派生状态联合',
      `// src/exhaustive/states.ts
const states = ['idle', 'loading', 'ready'] as const;
type State = typeof states[number];
function start(state: State): State {
  if (state === 'idle') return 'loading';
  return state;
}
console.log(states.map(start));
// const invalid: State = 'failed'; // TS2322

// npx tsc src/exhaustive/states.ts --strict --noEmit
// node --experimental-strip-types src/exhaustive/states.ts`,
      `输出 [ 'loading', 'loading', 'ready' ]；State 与运行时 states 元组保持一致。
失败边界：新增元组成员后所有 switch 会重新获得遗漏提示；如果另手写一份联合，两处可能漂移。`,
    ),
    tsExample(
      '索引查找把缺失分支显式建模',
      `// src/exhaustive/lookup.ts
const labels = {
  draft: '草稿',
  paid: '已付款',
  cancelled: '已取消',
} as const;
type Status = keyof typeof labels;

function label(raw: string): string {
  return raw in labels ? labels[raw as Status] : '未知状态';
}
console.log(label('paid'), label('missing'));

// npx tsc src/exhaustive/lookup.ts --strict --noEmit
// node --experimental-strip-types src/exhaustive/lookup.ts`,
      `输出 已付款 未知状态；索引前先检查键是否存在。
失败边界：把任意字符串断言成 Status 后读取，缺失键会返回 undefined 并可能继续显示为空白；映射必须保留 unknown 分支。`,
    ),
    tsExample(
      '类型测试锁定穷尽函数签名',
      `// test/exhaustive.test-d.ts
type State = 'idle' | 'ready';
type Label = State extends never ? never : string;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type _label = Assert<Equal<Label, string>>;

const state: State = 'ready';
console.log(state);
// npx tsc test/exhaustive.test-d.ts --strict --noEmit`,
      `类型测试通过，运行时输出 ready；联合变化会触发 Equal 断言失败。
失败边界：类型测试必须和实现一起被 tsconfig include，否则 CI 不会执行；还应补充一个运行时非法输入分支。`,
    ),
  ],
  '权限、租户与品牌类型': [
    tsExample(
      '不透明品牌隔离用户与订单标量',
      `// src/auth/brand.ts
declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };
type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;
const userId = (value: string): UserId => value as UserId;
const orderId = (value: string): OrderId => value as OrderId;

function owner(id: UserId): string { return id; }
console.log(owner(userId('u-1')));
// owner(orderId('o-1')); // TS2345

// npx tsc src/auth/brand.ts --strict --noEmit
// node --experimental-strip-types src/auth/brand.ts`,
      `输出 u-1；UserId 和 OrderId 在类型层不可互换。
失败边界：unique symbol 只提升类型安全，不会验证字符串格式；构造品牌前仍要检查前缀、长度和权限。`,
    ),
    tsExample(
      '租户上下文同时携带租户和用户身份',
      `// src/auth/context.ts
type TenantId = string & { readonly __tenant: unique symbol };
type UserId = string & { readonly __user: unique symbol };
type AuthContext = { readonly tenantId: TenantId; readonly userId: UserId; readonly roles: readonly string[] };

function createContext(tenantId: string, userId: string): AuthContext {
  if (!tenantId || !userId) throw new Error('identity-required');
  return { tenantId: tenantId as TenantId, userId: userId as UserId, roles: ['reader'] };
}
const context = createContext('t1', 'u1');
console.log(context.tenantId + ':' + context.userId);

// npx tsc src/auth/context.ts --strict --noEmit
// node --experimental-strip-types src/auth/context.ts`,
      `输出 t1:u1；后续函数可要求 AuthContext 一起传递租户与用户。
失败边界：只传 userId 而忘记 tenantId 会造成跨租户查询；授权入口必须从上下文中读取租户，而不是相信请求参数。`,
    ),
    tsExample(
      '权限用封闭联合阻止拼写错误',
      `// src/auth/permission.ts
type Permission = 'order:read' | 'order:write' | 'user:read';
type Principal = { readonly permissions: readonly Permission[] };

function can(principal: Principal, permission: Permission): boolean {
  return principal.permissions.includes(permission);
}
console.log(can({ permissions: ['order:read'] }, 'order:read'));
console.log(can({ permissions: ['order:read'] }, 'user:read'));
// console.log(can({ permissions: [] }, 'order:delete')); // TS2345

// npx tsc src/auth/permission.ts --strict --noEmit
// node --experimental-strip-types src/auth/permission.ts`,
      `输出 true false；order:delete 不在联合中，调用前就会被拒绝。
失败边界：联合只保护代码常量，外部字符串仍需映射到白名单；数据库中未知权限不能直接 as Permission。`,
    ),
    tsExample(
      '品牌值从解析边界生成并保留来源证据',
      `// src/auth/parse.ts
type UserId = string & { readonly __brand: 'UserId' };
function parseUserId(raw: unknown): UserId {
  if (typeof raw !== 'string' || !/^u-[a-z0-9]+$/.test(raw)) {
    throw new Error('invalid-user-id');
  }
  return raw as UserId;
}
try { console.log(parseUserId('u-17')); }
catch (error) { console.log(error instanceof Error ? error.message : 'error'); }

// npx tsc src/auth/parse.ts --strict --noEmit
// node --experimental-strip-types src/auth/parse.ts`,
      `合法输入输出 u-17；非法输入抛出 invalid-user-id。
失败边界：只在 as 处生成品牌而没有格式校验，会让任意字符串进入高权限函数；品牌构造必须与校验同处一个边界。`,
    ),
    tsExample(
      '类型隔离与运行时授权同时验收',
      `// src/auth/authorize.ts
type UserId = string & { readonly __user: unique symbol };
type Permission = 'read' | 'write';
type Principal = { readonly id: UserId; readonly permissions: readonly Permission[] };
const principal: Principal = { id: 'u1' as UserId, permissions: ['read'] };

function require(permission: Permission): void {
  if (!principal.permissions.includes(permission)) throw new Error('forbidden');
  console.log('allowed:' + permission);
}
require('read');
try { require('write'); } catch (error) {
  console.log(error instanceof Error ? error.message : 'unknown');
}

// npx tsc src/auth/authorize.ts --strict --noEmit
// node --experimental-strip-types src/auth/authorize.ts`,
      `先输出 allowed:read，再捕获 forbidden；类型检查通过不代表访问被允许。
失败边界：只靠前端类型或品牌不能保护服务端资源；授权必须在服务端每次请求上执行并记录租户边界。`,
    ),
  ],
  '领域类型重构实验': [
    tsExample(
      '盘点 any、断言和可选字段的真实位置',
      `// scripts/inventory.ts
import { readFileSync } from 'node:fs';
const source = readFileSync('src/order.ts', 'utf8');
const patterns = [/\bany\b/g, /\bas\s+[A-Z]/g, /\?\s*:/g];
const counts = patterns.map(pattern => (source.match(pattern) ?? []).length);
console.log(JSON.stringify({ any: counts[0], casts: counts[1], optional: counts[2] }));

// node --experimental-strip-types scripts/inventory.ts
// 修复前保存 JSON，修复后再次执行并对比`,
      `输出类似 {"any":1,"casts":2,"optional":3}；重构前后可量化风险变化。
失败边界：正则统计只是定位线索，可能把注释字符串算进去；每个命中都要打开文件判断是否进入公共边界。`,
    ),
    tsExample(
      '构造器把领域不变式从调用方收回',
      `// src/domain/order.ts
type Order = { readonly id: string; readonly quantity: number };
function createOrder(id: string, quantity: number): Order {
  if (!/^o-/.test(id)) throw new Error('invalid-order-id');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('invalid-quantity');
  return { id, quantity };
}
console.log(createOrder('o-1', 3));
// createOrder('o-2', 0); // runtime invariant failure

// npx tsc src/domain/order.ts --strict --noEmit
// node --experimental-strip-types src/domain/order.ts`,
      `合法创建输出 { id: 'o-1', quantity: 3 }，数量 0 时抛出 invalid-quantity。
失败边界：把校验散落在每个调用方会漏掉新入口；构造器是集中建立不变式的位置，但迁移后仍需保留测试。`,
    ),
    tsExample(
      '状态与命令拆分后再组合处理器',
      `// src/domain/order-handler.ts
type State = { readonly id: string; readonly status: 'draft' | 'paid' };
type Command = { readonly type: 'pay'; readonly paymentId: string };
function handle(state: State, command: Command): State {
  if (state.status !== 'draft') throw new Error('not-payable');
  if (!command.paymentId) throw new Error('payment-required');
  return { ...state, status: 'paid' };
}
const next = handle({ id: 'o1', status: 'draft' }, { type: 'pay', paymentId: 'p1' });
console.log(next.status);

// npx tsc src/domain/order-handler.ts --strict --noEmit
// node --experimental-strip-types src/domain/order-handler.ts`,
      `输出 paid；状态和命令各自描述职责，处理器负责决定迁移。
失败边界：把命令字段塞回状态会让快照包含未消费意图；重构后需验证旧请求适配器仍能构造当前命令。`,
    ),
    tsExample(
      '适配器把旧 DTO 转换为当前领域对象',
      `// src/domain/adapt.ts
type LegacyOrder = { order_id: string; qty: string; state: 'NEW' | 'PAID' };
type Order = { readonly id: string; readonly quantity: number; readonly status: 'draft' | 'paid' };
function fromLegacy(raw: LegacyOrder): Order {
  const quantity = Number(raw.qty);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('bad-qty');
  return { id: raw.order_id, quantity, status: raw.state === 'PAID' ? 'paid' : 'draft' };
}
console.log(fromLegacy({ order_id: 'o1', qty: '2', state: 'PAID' }));

// npx tsc src/domain/adapt.ts --strict --noEmit
// node --experimental-strip-types src/domain/adapt.ts`,
      `输出 { id: 'o1', quantity: 2, status: 'paid' }；旧字段只存在于适配层。
失败边界：适配器直接 as Order 会跳过数字和状态检查；所有旧数据入口都要保留失败分支测试。`,
    ),
    tsExample(
      '重构发布前后同时验证类型与行为',
      `// src/domain/index.ts
export type Order = { readonly id: string; readonly status: 'draft' | 'paid' };
export const parse = (id: string): Order => ({ id, status: 'draft' });

// test/order.test.ts
import { strict as assert } from 'node:assert';
import { parse } from '../src/domain/index.js';
assert.equal(parse('o1').status, 'draft');
console.log('domain contract ok');

// npx tsc src/domain/index.ts test/order.test.ts --strict --noEmit
// node --experimental-strip-types test/order.test.ts
// pnpm pack 后在隔离目录运行消费者样例`,
      `类型检查无诊断，测试输出 domain contract ok，消费者可导入新入口。
失败边界：只运行旧单元测试可能错过声明入口变化；发布前需同时验证源码、声明、打包入口和回滚路径。`,
    ),
  ],
});

Object.assign(typescriptExamples, {
  '联合、交叉与字面量类型': [
    tsExample(
      '联合值先收窄再调用成员方法',
      `// src/union.ts
function render(value: string | number): string {
  return typeof value === 'number'
    ? value.toFixed(2)
    : value.trim().toUpperCase();
}

console.log(render(12), render(' api '));
// 直接写 value.toFixed() 会触发 TS2339

// npx tsc src/union.ts --strict --noEmit
// node --experimental-strip-types src/union.ts`,
      `输出 12.00 和 API；number 分支才允许调用 toFixed，string 分支才允许 trim。
失败边界：对联合值直接 as number 只关闭检查，传入字符串时运行时仍会抛 TypeError；必须由 typeof 等运行时证据收窄。`,
    ),
    tsExample(
      '封闭状态字面量贯穿到函数入口',
      `// src/status.ts
type Status = 'draft' | 'paid' | 'cancelled';
const config = { status: 'draft' } as const satisfies { status: Status };

function canShip(status: Status): boolean {
  return status === 'paid';
}

console.log(config.status, canShip('paid'));
// canShip('unknown'); // TS2345

// npx tsc src/status.ts --strict --noEmit
// node --experimental-strip-types src/status.ts`,
      `输出 draft true；unknown 会因不属于 Status 而被 tsc 拒绝。
失败边界：接口若把 status 放宽成 string，调用方可在入口之前绕过联合；外部字符串必须先校验再赋给 Status。`,
    ),
    tsExample(
      '交叉类型把冲突字段缩成 never',
      `// src/intersection.ts
type Created = { kind: 'created'; id: string };
type Failed = { kind: 'failed'; reason: string };

function describe(event: Created & Failed): never {
  throw new Error('impossible kind=' + event.kind);
}

const ok: Created = { kind: 'created', id: 'a-1' };
console.log(ok.id);
// const bad: Created & Failed = { kind: 'created', id: 'a-1', reason: 'x' };

// npx tsc src/intersection.ts --strict --noEmit
// node --experimental-strip-types src/intersection.ts`,
      `正常分支输出 a-1；Created & Failed 的 kind 同时要求 created 与 failed，实际缩成 never，无法构造合法对象。
失败边界：交叉类型表示同时满足，不是二选一；互斥分支应使用联合，否则业务对象根本没有合法赋值。`,
    ),
    tsExample(
      '判别字段让每个事件分支拥有独立载荷',
      `// src/events.ts
type Event =
  | { type: 'created'; id: string }
  | { type: 'failed'; id: string; reason: string }
  | { type: 'archived'; id: string; at: string };

function describe(event: Event): string {
  switch (event.type) {
    case 'created': return 'created:' + event.id;
    case 'failed': return 'failed:' + event.reason;
    case 'archived': return 'archived:' + event.at;
  }
}

console.log(describe({ type: 'failed', id: 'a', reason: 'timeout' }));

// npx tsc src/events.ts --strict --noEmit`,
      `输出 failed:timeout；进入 failed 分支后可以直接访问 reason。
失败边界：判别字段若被断言为任意字符串，运行时可能进入没有实现的分支；外部数据必须先解析成封闭 Event。`,
    ),
    tsExample(
      'satisfies 保留精确字面量并检查契约',
      `// src/normalize.ts
type Actions = Record<'read' | 'write' | 'admin', readonly string[]>;
const permissions = {
  read: ['orders'],
  write: ['orders'],
  admin: ['users'],
} as const satisfies Actions;

function audit(role: keyof typeof permissions): string {
  return role + ':' + permissions[role].join(',');
}

console.log(audit('read'));

// npx tsc src/normalize.ts --strict --noEmit
// node --experimental-strip-types src/normalize.ts`,
      `输出 read:orders；字典既满足三个固定键，又保留 readonly 字面量数组精度。
失败边界：直接用 Actions 注解会把每个数组拓宽成 readonly string[]，丢失具体权限值；公共消费仍取决于运行时授权。`,
    ),
  ],
  'typeof、in、instanceof 与类型守卫': [
    tsExample(
      'typeof 只收窄到 JavaScript 基础类别',
      `// src/typeof.ts
function format(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return value.toFixed(1);
  if (typeof value === 'bigint') return value.toString() + 'n';
  return 'unsupported:' + typeof value;
}

console.log(format(' x '), format(2), format(9n), format(null));

// npx tsc src/typeof.ts --strict --noEmit
// node --experimental-strip-types src/typeof.ts`,
      `输出 x、2.0、9n、unsupported:object；每个分支只获得对应原始类型的操作。
失败边界：typeof null 仍是 object，不能据此认为值一定可读字段；对象分支还要检查 null。`,
    ),
    tsExample(
      'in 区分不同对象形状',
      `// src/in.ts
type ApiError = { error: { code: string } };
type ApiData = { data: { id: string } };

function unwrap(payload: ApiError | ApiData): string {
  if ('error' in payload) return payload.error.code;
  return payload.data.id;
}

console.log(unwrap({ error: { code: 'E42' } }));
console.log(unwrap({ data: { id: 'a-1' } }));

// npx tsc src/in.ts --strict --noEmit
// node --experimental-strip-types src/in.ts`,
      `依次输出 E42 和 a-1；in 判断让两个结构不同的分支分别可访问。
失败边界：in 检查继承属性，外部对象也可伪造同名字段；高安全边界仍需完整 schema 校验。`,
    ),
    tsExample(
      'instanceof 依据原型链识别类实例',
      `// src/instanceof.ts
class TimeoutError extends Error {
  constructor(readonly timeoutMs: number) { super('timeout'); }
}
class ValidationError extends Error {}

function classify(error: unknown): string {
  if (error instanceof TimeoutError) return 'timeout:' + error.timeoutMs;
  if (error instanceof ValidationError) return 'validation';
  return error instanceof Error ? error.message : String(error);
}

console.log(classify(new TimeoutError(250)), classify(new Error('boom')));

// npx tsc src/instanceof.ts --strict --noEmit
// node --experimental-strip-types src/instanceof.ts`,
      `输出 timeout:250 和 boom；instanceof 同时验证运行时原型链。
失败边界：跨 iframe、序列化或来自另一份依赖副本的 Error 可能无法通过 instanceof，网络错误不应只依赖类身份。`,
    ),
    tsExample(
      '用户定义类型谓词封装完整守卫',
      `// src/predicate.ts
type User = { id: string; name: string; active: boolean };

function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.name === 'string'
    && typeof row.active === 'boolean';
}

const input: unknown = { id: 'u1', name: 'Ada', active: true };
console.log(isUser(input));
if (isUser(input)) console.log(input.name.toUpperCase());

// npx tsc src/predicate.ts --strict --noEmit
// node --experimental-strip-types src/predicate.ts`,
      `依次输出 true 和 ADA；谓词返回 true 后调用方可安全读取 User 字段。
失败边界：谓词函数体若只写 return true，TypeScript 不会检查字段是否存在；守卫本身必须有逐字段运行时判断。`,
    ),
    tsExample(
      '复合输入用分层守卫保持错误可定位',
      `// src/layers.ts
type Header = { requestId: string };
type Body = { userId: string; amount: number };

function isHeader(value: unknown): value is Header {
  const row = value as Record<string, unknown>;
  return typeof row?.requestId === 'string' && row.requestId.length > 0;
}
function isBody(value: unknown): value is Body {
  const row = value as Record<string, unknown>;
  return typeof row?.userId === 'string'
    && typeof row.amount === 'number' && row.amount > 0;
}

const payload: unknown = { requestId: 'r-1', userId: 'u-1', amount: 12 };
if (!isHeader(payload)) throw new Error('header');
if (!isBody(payload)) throw new Error('body');
console.log(payload.requestId + ':' + payload.userId + ':' + payload.amount);

// npx tsc src/layers.ts --strict --noEmit`,
      `合法载荷输出 r-1:u-1:12；缺少 requestId 时抛 header，amount 非数字时抛 body。
失败边界：把所有字段塞进一个复杂守卫会让错误无法区分；分层检查应在首个失败层停止并记录字段路径。`,
    ),
  ],
  '泛型约束、默认参数与推断': [
    tsExample(
      '泛型参数保存键与值的关联',
      `// src/pair.ts
function pick<T, K extends keyof T>(row: T, key: K): T[K] {
  return row[key];
}

const user = { id: 'u1', age: 36, active: true } as const;
const id: string = pick(user, 'id');
const age: number = pick(user, 'age');
console.log(id, age);
// pick(user, 'missing'); // TS2345

// npx tsc src/pair.ts --strict --noEmit
// node --experimental-strip-types src/pair.ts`,
      `输出 u1 36；K 被限制为 T 的实际键，返回值自动是 T[K]。
失败边界：若签名改成 (row: any, key: string)，错误键名和返回类型都会失去保护；泛型应连接输入与输出，而不是装饰函数名。`,
    ),
    tsExample(
      '约束只要求当前算法真正使用的成员',
      `// src/constraint.ts
function total<T extends { amount: number }>(rows: readonly T[]): number {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

const orders = [{ id: 'a', amount: 12 }, { id: 'b', amount: 8 }];
console.log(total(orders));
// console.log(total([{ id: 'c' }])); // TS2322

// npx tsc src/constraint.ts --strict --noEmit
// node --experimental-strip-types src/constraint.ts`,
      `输出 20；约束只要求 amount: number，额外 id 字段仍被保留。
失败边界：约束写得太宽如 object 会无法访问 amount；写得太窄又会拒绝合法输入，约束应来自算法最小需求。`,
    ),
    tsExample(
      '默认类型参数稳定无推断调用',
      `// src/defaults.ts
type AsyncState<T, E = Error> =
  | { status: 'loading' }
  | { status: 'success'; value: T }
  | { status: 'error'; error: E };

function logState<T>(state: AsyncState<T>): string {
  return state.status === 'success' ? String(state.value) : state.status;
}

const ready: AsyncState<number> = { status: 'success', value: 7 };
console.log(logState(ready));

// npx tsc src/defaults.ts --strict --noEmit
// node --experimental-strip-types src/defaults.ts`,
      `输出 success；只指定 T 时错误类型自动使用 Error。
失败边界：默认类型参数如果掩盖了必须提供的值，调用方可能得到过宽的 any 或 unknown；默认值应是安全且常见的回退。`,
    ),
    tsExample(
      'NoInfer 阻止配置值反向影响推断',
      `// src/no-infer.ts
function createStore<T extends string>(
  initial: T,
  choices: readonly NoInfer<T>[] = [],
): { value: T; choices: readonly T[] } {
  return { value: initial, choices };
}

const store = createStore('draft', ['draft', 'paid']);
console.log(store.value, store.choices.join(','));
// createStore('draft', ['unknown']); // TS2322

// npx tsc src/no-infer.ts --strict --noEmit
// node --experimental-strip-types src/no-infer.ts`,
      `输出 draft draft,paid；T 只由 initial 决定，choices 必须服从该范围。
失败边界：去掉 NoInfer 后 choices 可能把 T 扩成 'draft' | 'unknown'，导致返回状态集合被配置悄悄放宽。`,
    ),
    tsExample(
      'const 类型参数保留数组字面量',
      `// src/const-generic.ts
function tuple<const T extends readonly unknown[]>(values: T): T {
  return values;
}

const route = tuple(['orders', 'active']);
const first: 'orders' = route[0];
console.log(first, route.length);

// npx tsc src/const-generic.ts --strict --noEmit
// node --experimental-strip-types src/const-generic.ts`,
      `输出 orders 2；route[0] 保持 'orders' 字面量而不是普通 string。
失败边界：const 推断保留更深结构，也会增加声明体积；大型配置对象应只在确实需要字面量精度时使用。`,
    ),
  ],
  'keyof、索引访问与映射类型': [
    tsExample(
      'keyof 返回联合键索引访问返回属性类型',
      `// src/keyof.ts
type Account = { id: string; balance: number; active: boolean };
type AccountKey = keyof Account;
type AccountValue = Account[AccountKey];

const keys: AccountKey[] = ['id', 'balance', 'active'];
const values: AccountValue[] = ['u1', 10, true];
console.log(keys.join(','), values.join(':'));

// npx tsc src/keyof.ts --strict --noEmit
// node --experimental-strip-types src/keyof.ts`,
      `输出 id,balance,active 和 u1:10:true；键联合和值联合来自同一类型。
失败边界：keyof 只覆盖声明成员，不包含索引签名中的运行时任意键；动态配置仍需 noUncheckedIndexedAccess 和入口校验。`,
    ),
    tsExample(
      '数组下标类型与元组位置类型',
      `// src/indexed-access.ts
type Row = readonly [id: string, amount: number];
type RowAt0 = Row[0];
type RowAt1 = Row[1];
type RowLength = Row['length'];

const row: Row = ['o-1', 42];
const id: RowAt0 = row[0];
const amount: RowAt1 = row[1];
const length: RowLength = row.length;
console.log(id, amount, length);

// npx tsc src/indexed-access.ts --strict --noEmit
// node --experimental-strip-types src/indexed-access.ts`,
      `输出 o-1 42 2；索引访问保留元组各槽位的类型与长度字面量。
失败边界：普通 string[] 的 number 索引不会提供固定槽位，读取任意位置仍可能得到 undefined；固定结构应使用元组。`,
    ),
    tsExample(
      '映射类型改写可选性和只读性',
      `// src/mapped.ts
type User = { readonly id: string; name: string; nickname?: string };
type Editable<T> = { -readonly [K in keyof T]-?: T[K] };

const draft: Editable<User> = { id: 'u1', name: 'Ada', nickname: '' };
draft.name = 'Lin';
console.log(JSON.stringify(draft));

// npx tsc src/mapped.ts --strict --exactOptionalPropertyTypes --noEmit
// node --experimental-strip-types src/mapped.ts`,
      `输出 {"id":"u1","name":"Lin","nickname":""}；映射类型去掉 readonly 和可选修饰。
失败边界：去掉 ? 要求字段存在，但不会检查运行时对象；从 JSON 得到的数据仍要按 schema 解析。`,
    ),
    tsExample(
      '键重映射生成只读选择器表',
      `// src/remap.ts
type User = { id: string; name: string; email: string };
type Selectors<T> = {
  readonly [K in keyof T as 'get' + Capitalize<string & K>]: (row: T) => T[K]
};

const selectors: Selectors<User> = {
  getId: row => row.id,
  getName: row => row.name,
  getEmail: row => row.email,
};

console.log(selectors.getName({ id: 'u1', name: 'Ada', email: 'a@example.com' }));

// npx tsc src/remap.ts --strict --noEmit
// node --experimental-strip-types src/remap.ts`,
      `输出 Ada；键通过模板字面量类型从 id/name/email 映射成 getXxx。
失败边界：重映射只改变类型键，不会自动生成运行时对象；实现与类型表不一致时仍会在赋值处暴露。`,
    ),
    tsExample(
      '映射组合生成事件处理器契约',
      `// src/events.ts
type DomainEvent = {
  created: { id: string };
  failed: { id: string; reason: string };
};
type Handlers = {
  readonly [K in keyof DomainEvent]: (payload: DomainEvent[K]) => void
};

const handlers: Handlers = {
  created: payload => console.log('created:' + payload.id),
  failed: payload => console.log('failed:' + payload.reason),
};

handlers.created({ id: 'a1' });

// npx tsc src/events.ts --strict --noEmit
// node --experimental-strip-types src/events.ts`,
      `输出 created:a1；每个处理器自动获得对应事件载荷。
失败边界：复杂的键变换可能让编辑器提示难以阅读；类型组合应服务调用方，必要时用显式别名拆开并写类型测试。`,
    ),
  ],
  '条件类型、infer 与模板字面量': [
    tsExample(
      '裸类型参数的条件类型会分发联合',
      `// src/distribute.ts
type ToArray<T> = T extends unknown ? T[] : never;
type Result = ToArray<string | number>;

const values: Result[] = [['a'], [1]];
console.log(values.length, values[0][0], values[1][0]);

// npx tsc src/distribute.ts --strict --noEmit
// node --experimental-strip-types src/distribute.ts`,
      `输出 2 a 1；string | number 被分发成 string[] | number[]。
失败边界：把参数包进元组如 [T] extends [unknown] 会关闭分发；处理联合时要明确是否需要逐成员计算。`,
    ),
    tsExample(
      'infer 从 Promise 与函数中提取内部形状',
      `// src/infer.ts
type AwaitedValue<T> = T extends Promise<infer V> ? V : T;
type ReturnOf<T> = T extends (...args: never[]) => infer R ? R : never;

type Ready = AwaitedValue<Promise<{ id: string }>>;
type Value = ReturnOf<() => number>;

const ready: Ready = { id: 'a1' };
const value: Value = 42;
console.log(ready.id, value);

// npx tsc src/infer.ts --strict --noEmit
// node --experimental-strip-types src/infer.ts`,
      `输出 a1 42；infer 在匹配位置声明局部类型变量并返回。
失败边界：infer 只存在于条件类型分支，不会生成运行时变量；对任意函数类型使用 never[] 参数还要考虑严格函数类型检查。`,
    ),
    tsExample(
      '元组递归在空元组处终止',
      `// src/tuple-recursion.ts
type Reverse<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? [...Reverse<Tail>, Head]
    : [];

const reversed = ['a', 'b', 'c'] as const satisfies Reverse<readonly ['a', 'b', 'c']>;
console.log(reversed.join('-'));

// npx tsc src/tuple-recursion.ts --strict --noEmit
// node --experimental-strip-types src/tuple-recursion.ts`,
      `输出 c-b-a；递归在空元组分支返回 []，每一层把首项移到尾部。
失败边界：递归缺少空元组终止条件会触发过深实例化；长元组还会增加编译时间，应设置合理上限。`,
    ),
    tsExample(
      '模板字面量类型限制缓存键格式',
      `// src/template.ts
type Resource = 'user' | 'order';
type CacheKey = Resource + ':' + string;

function cacheKey(resource: Resource, id: string): CacheKey {
  return resource + ':' + id;
}

const key = cacheKey('order', 'o-9');
console.log(key);
// const bad: CacheKey = 'product:1'; // TS2322

// npx tsc src/template.ts --strict --noEmit
// node --experimental-strip-types src/template.ts`,
      `输出 order:o-9；CacheKey 要求资源前缀来自两个字面量之一。
失败边界：模板字面量只检查字符串形状，不保证 id 非空或真实存在；运行时入口仍应校验 id。`,
    ),
    tsExample(
      '递归模板展开路径前先限制联合规模',
      `// src/paths.ts
type Leaves<T, Prefix extends string = ''> =
  T extends readonly unknown[]
    ? Prefix
    : T extends object
      ? { [K in keyof T & string]: Leaves<T[K], Prefix extends '' ? K : Prefix + '.' + K> }[keyof T & string]
      : Prefix;

type Routes = Leaves<{ orders: { id: string; total: number }; users: { name: string } }>;
const routes: Routes[] = ['orders.id', 'orders.total', 'users.name'];
console.log(routes.join(','));

// npx tsc src/paths.ts --strict --noEmit`,
      `routes 只能取三个叶子路径，程序输出 orders.id,orders.total,users.name。
失败边界：对超大对象递归展开会显著增加内存和编辑器延迟；优先按业务域拆分类型，或直接生成简单联合。`,
    ),
  ],
  '类型体操的边界与可读性': [
    tsExample(
      '类型名表达业务约束而不是算法步骤',
      `// src/business-types.ts
type PaidOrder = {
  readonly status: 'paid';
  readonly paidAt: Date;
  readonly amountCents: number;
};
type RefundableOrder = PaidOrder & { readonly refundableUntil: Date };

function refund(order: RefundableOrder, now: Date): boolean {
  return order.amountCents > 0 && now <= order.refundableUntil;
}

console.log(refund({ status: 'paid', paidAt: new Date(), amountCents: 100,
  refundableUntil: new Date('2030-01-01') }, new Date('2029-01-01')));

// npx tsc src/business-types.ts --strict --noEmit
// node --experimental-strip-types src/business-types.ts`,
      `输出 true；RefundableOrder 名称直接说明允许退款后的约束。
失败边界：只写复杂条件类型却不命名领域概念，调用方无法从错误信息判断业务规则；高价值类型应使用领域别名。`,
    ),
    tsExample(
      '用 extendedDiagnostics 测量类型检查成本',
      `// src/cost.ts
type Route = 'orders' | 'users' | 'invoices';
type Action = 'list' | 'read' | 'write';
type Matrix = Route + ':' + Action;

const route: Matrix = 'orders:read';
console.log(route);

// npx tsc src/cost.ts --strict --noEmit --extendedDiagnostics
// 对比增加两个联合成员后的诊断输出
// npx tsc src/cost.ts --strict --noEmit --diagnostics`,
      `命令输出 Types、Instantiations、Memory used 等指标；小联合只产生有限实例化。
失败边界：类型技巧导致 Instantiations 和内存持续增长时，编辑器补全也会变慢；优化前先保存基线数字。`,
    ),
    tsExample(
      '约束输入形状以改善类型错误信息',
      `// src/errors.ts
type Row<K extends string> = { key: K; value: K };
function make<K extends string>(key: K): Row<K> {
  return { key, value: key };
}

console.log(make('status'));
// make(42); // TS2345: number is not assignable to string

// npx tsc src/errors.ts --strict --noEmit
// 将 K extends string 去掉再对比诊断`,
      `合法调用返回 { key: 'status', value: 'status' }；传入数字时错误直接指向 K 必须满足 string。
失败边界：约束过宽会让错误出现在实现深处，调用方难以知道哪个参数错了；公共泛型应在入口声明最小约束。`,
    ),
    tsExample(
      '复杂类型无法维护时改用生成代码',
      `// scripts/generate.ts
const routes = ['orders', 'users'] as const;
const actions = ['list', 'read'] as const;
const lines = routes.flatMap(route =>
  actions.map(action => JSON.stringify(route + ':' + action)));
console.log('export type RouteKey =\\n  | ' + lines.join('\\n  | ') + ';');

// 生成文件 events.generated.ts 后由正常源码导入
// node --experimental-strip-types scripts/generate.ts > src/route-keys.ts
// npx tsc src/route-keys.ts --strict --noEmit`,
      `脚本输出 RouteKey 的联合成员并写入生成文件，检查器只面对稳定代码。
失败边界：生成文件若未进入版本控制或 CI，部署时可能缺少类型；生成命令、输入和产物需要一起评审。`,
    ),
    tsExample(
      '把类型技巧固定成契约测试',
      `// test/contract.test-d.ts
import type { Brand, UserId } from '../src/brand.js';
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type _id = Assert<Equal<Brand<'user'>, string & { readonly __brand: 'user' }>>;
const id: UserId = 'u1' as UserId;
console.log(id);

// npx tsc test/contract.test-d.ts --strict --noEmit`,
      `契约测试编译通过；若 Brand 结构改变，Equal 约束会让类型错误在 CI 直接出现。
失败边界：类型测试只证明形状，不证明运行时解析；仍需同时测试真实输入和解析失败路径。`,
    ),
  ],
});

Object.assign(typescriptExamples, {
  'tsup、rollup 与源码映射': [
    tsExample(
      'tsup 配置生成 ESM、CJS 和声明',
      `// tsup.config.ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/schema.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
});

// src/index.ts
export const version = '1.0.0';

// pnpm add -D tsup typescript
// pnpm exec tsup
// Get-ChildItem dist`,
      `dist 出现 index.js、index.cjs、index.d.ts、schema 入口和对应 map。
失败边界：只配置一个 entry 会漏掉 schema 子路径；发布前必须逐个 import 所有公开入口而不是只看构建成功。`,
    ),
    tsExample(
      '双格式优先使用命名导出',
      `// src/index.ts
export function parseOrder(raw: { id: string }): string {
  return raw.id;
}

// tsup.config.ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'], format: ['esm', 'cjs'], dts: true,
  sourcemap: true, clean: true,
});

// ESM 消费者
// node --input-type=module -e "import('./dist/index.js').then(m => console.log(m.parseOrder({id:'o1'})))"
// CJS 消费者
// node -e "console.log(require('./dist/index.cjs').parseOrder({id:'o2'}))"`,
      `ESM 与 CJS 消费者分别输出 o1 和 o2，都通过 parseOrder 命名导出访问。
失败边界：默认导出在 interop 下可能多一层包装；库应优先提供命名导出，并为每种加载方式保留真实夹具。`,
    ),
    tsExample(
      'source map 把生产错误映射回 TS 源文件',
      `// src/index.ts
export function fail(message: string): never {
  throw new Error(message);
}

// tsup.config.ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'], format: ['esm'], sourcemap: true,
  clean: true, target: 'node20',
});

// pnpm exec tsup
// node --enable-source-maps -e "import('./dist/index.js').then(m => m.fail('boom'))"

// Get-Content dist/index.js.map`,
      `堆栈错误位置回指 src/index.ts 的 fail 函数，而不是只显示压缩后的 dist 行号。
失败边界：仅打开 sourcemap 但 Node 没启用 --enable-source-maps 时仍显示产物位置；包内还需携带 map 或 sourceRoot。`,
    ),
    tsExample(
      '运行时依赖 external 并声明 peer',
      `// tsup.config.ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  external: ['zod'],
  dts: true,
  clean: true,
});

// package.json
{
  "peerDependencies": { "zod": "^3.23.0" },
  "sideEffects": false
}

// src/index.ts
import { z } from 'zod';
export const schema = z.object({ id: z.string() });

// pnpm exec tsup
// Select-String -Path dist/index.js -Pattern 'from "zod"'`,
      `产物保留外部 import 'zod'，消费者负责提供单一版本实例。
失败边界：把 z 或 React 打包进库会产生多实例问题；external 的包必须同时出现在 peerDependencies 或明确的依赖契约中。`,
    ),
    tsExample(
      '发布产物同时通过 publint、attw 与安装夹具',
      `// package.json scripts
{
  "build": "tsup",
  "check:pack": "publint && attw --pack .",
  "check": "pnpm build && pnpm check:pack"
}

// pnpm add -D publint @arethetypeswrong/cli
// pnpm check
// pnpm pack
// npm install ./acme-order-kernel-1.0.0.tgz
// node -e "import('@acme/order-kernel').then(m => console.log(typeof m.parseOrder))"`,
      `publint 与 attw 检查 exports 和类型解析，安装 tarball 后输出 function。
失败边界：工具通过只证明包声明结构，不证明每个导出行为；还要运行真实 ESM、CJS 和 tsc 消费者样例。`,
    ),
  ],
  'package exports 和模块解析': [
    tsExample(
      'exports 是发布子路径允许列表',
      `// package.json
{
  "name": "@acme/order-kernel",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./schema": "./dist/schema.js"
  }
}

// consumer/main.ts
import { parseOrder } from '@acme/order-kernel';
import { orderSchema } from '@acme/order-kernel/schema';
console.log(parseOrder({ id: 'o1' }), typeof orderSchema);

// pnpm install ./acme-order-kernel-1.0.0.tgz
// npx tsc consumer/main.ts --strict --module NodeNext --noEmit
// node consumer/main.js`,
      `主入口和 schema 子路径都能加载；未列出的内部路径会被 exports 拒绝。
失败边界：开发时直接 import src/internal.js 可能成功，但发布包没有该文件；消费者只能使用公开子路径。`,
    ),
    tsExample(
      'types 条件指向与运行时匹配的声明',
      `// package.json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}

// consumer/main.ts
import { version } from '@acme/order-kernel';
const release: string = version;
console.log(release);

// npx tsc consumer/main.ts --strict --module NodeNext --noEmit
// 把 types 指到 dist-old/index.d.ts 后再运行`,
      `正确条件时 tsc 读取 index.d.ts；错误旧路径时报告找不到模块或声明。
失败边界：运行时入口和声明版本不一致会让类型通过而实现缺失字段；必须用同一构建产物验证两个条件。`,
    ),
    tsExample(
      '命名导出让 ESM 与 CJS 消费方式稳定',
      `// src/index.ts
export const name = 'order-kernel';
export function parse(raw: { id: string }): string { return raw.id; }

// after tsup build
// ESM
import { name, parse } from '@acme/order-kernel';
console.log(name, parse({ id: 'o1' }));

// CJS
const kernel = require('@acme/order-kernel');
console.log(kernel.name, kernel.parse({ id: 'o2' }));

// node --input-type=module -e "import('@acme/order-kernel').then(console.log)"
// node -e "console.log(require('@acme/order-kernel'))"`,
      `两种加载方式都能读到 name 与 parse，输出 order-kernel o1/o2。
失败边界：依赖 default export 在不同 bundler 中可能得到不同包装；公共 API 尽量使用明确的命名导出。`,
    ),
    tsExample(
      '子路径入口使用真实文件扩展名',
      `// package.json
{
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./schema": { "types": "./dist/schema.d.ts", "import": "./dist/schema.js" }
  }
}

// src/schema.ts
export const schemaName = 'order-schema';
export const orderKeys = ['id', 'amountCents'];

// consumer/main.ts
import { schemaName } from '@acme/order-kernel/schema';
console.log(schemaName);

// npx tsc consumer/main.ts --strict --module NodeNext --noEmit
// node consumer/main.js`,
      `NodeNext 从 ./schema 条件解析到 dist/schema.js，消费者输出 order-schema。
失败边界：源码相对导入省略 .js 在检查阶段可能被 paths 掩盖；真实 Node 运行仍可能报 ERR_MODULE_NOT_FOUND。`,
    ),
    tsExample(
      'publint 与 attw 检查条件矩阵',
      `// package.json scripts
{
  "pack:check": "publint && attw --pack .",
  "consumer:check": "node test/esm.mjs && node test/cjs.cjs"
}

// test/esm.mjs
import { parse } from '@acme/order-kernel';
if (typeof parse !== 'function') throw new Error('esm export');
console.log('esm export ok');

// test/cjs.cjs
const { parse } = require('@acme/order-kernel');
if (typeof parse !== 'function') throw new Error('cjs export');
console.log('cjs export ok');

// pnpm pack:check && pnpm consumer:check`,
      `publint 与 attw 无阻断，ESM 和 CJS 夹具分别输出 export ok。
失败边界：publint 不能发现实现命名导出被 tree shaking 丢失；最终证据仍是安装 tarball 后运行两种加载器。`,
    ),
  ],
  '声明产物与 API 兼容': [
    tsExample(
      '构建后逐段审阅公开 d.ts',
      `// src/order.ts
export type Order = { readonly id: string; readonly amountCents: number };
export function parseOrder(raw: { id: string; amountCents: number }): Order {
  if (raw.amountCents <= 0) throw new Error('amount');
  return { id: raw.id, amountCents: raw.amountCents };
}
export const create = parseOrder;

// npx tsc src/order.ts --strict --declaration --emitDeclarationOnly --outDir dist
// Get-Content dist/order.d.ts`,
      `声明文件包含 Order、parseOrder 和 create 的签名，不包含函数体。
失败边界：声明出现内部文件路径或私有类型时消费者无法解析；每个发布声明都应由 tsc 消费者实际编译。`,
    ),
    tsExample(
      '公开返回类型先投影到可达类型',
      `// src/internal.ts
type InternalOrder = { id: string; secret: string };
export type PublicOrder = { id: string };
export function toPublic(order: InternalOrder): PublicOrder {
  return { id: order.id };
}

// src/index.ts
export { toPublic } from './internal.js';
export type { PublicOrder } from './internal.js';

// npx tsc src/index.ts --strict --declaration --emitDeclarationOnly --outDir dist
// Get-Content dist/index.d.ts`,
      `index.d.ts 只引用 PublicOrder，内部 InternalOrder 不进入公开导出。
失败边界：若函数返回 InternalOrder，声明会引用未导出的私有类型，消费者出现找不到模块或字段泄漏。`,
    ),
    tsExample(
      'API Extractor 报告固定公开签名',
      `// api-extractor.json
{
  "projectFolder": ".",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "dtsRollup": { "enabled": true, "untrimmedFilePath": "dist/index.d.ts" },
  "apiReport": { "enabled": true, "reportFolder": "reports/" }
}

// src/index.ts
export type User = { readonly id: string };
export function parseUser(raw: { id: string }): User { return { id: raw.id }; }

// npx tsc --declaration --emitDeclarationOnly --outDir dist
// npx api-extractor run --local
// Get-Content reports/index.api.md`,
      `reports/index.api.md 列出 User 和 parseUser 的稳定签名。
失败边界：报告变化不代表运行时已破坏，报告未变也不证明实现兼容；必须结合消费者类型检查和行为测试。`,
    ),
    tsExample(
      'declarationMap 让声明跳回原始源码',
      `// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true
  },
  "include": ["src"]
}

// src/index.ts
export function add(left: number, right: number): number { return left + right; }

// npx tsc -p tsconfig.json
// Get-Content dist/index.d.ts
// Get-Content dist/index.d.ts.map`,
      `dist 同时生成 .js、.d.ts、.js.map 和 .d.ts.map，声明映射指向 src/index.ts。
失败边界：发布 files 漏掉 map 或源码时编辑器无法跳转；sourceRoot 指向 CI 临时目录也会让映射失效。`,
    ),
    tsExample(
      '用 tarball 和 traceResolution 验证声明入口',
      `// package.json
{
  "name": "@acme/order-kernel",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"]
}

// consumer/src/main.ts
import { parseOrder } from '@acme/order-kernel';
console.log(parseOrder({ id: 'o1' }));

// pnpm pack
// npm install ./acme-order-kernel-1.0.0.tgz
// npx tsc consumer/src/main.ts --strict --module NodeNext --traceResolution

// node consumer/src/main.js`,
      `traceResolution 显示从 node_modules/@acme/order-kernel/dist/index.d.ts 读取声明，运行输出 o1。
失败边界：workspace 源码路径可能让 tsc 绕过 exports；必须打印解析路径并确认位于已安装 tarball 内。`,
    ),
  ],
  'ESLint、测试和发布流水线': [
    tsExample(
      '脚本拆分让每一步失败都有独立证据',
      `// package.json
{
  "scripts": {
    "install:ci": "pnpm install --frozen-lockfile",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "build": "tsup",
    "check": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
  }
}

// pnpm install --frozen-lockfile
// pnpm check
// 故意写一个未使用变量后再次执行 pnpm check`,
      `干净状态所有步骤返回 0；加入未使用变量后 lint 单独返回非零并阻止后续发布。
失败边界：把所有步骤串成一个自定义脚本会丢失具体失败阶段；CI 应保留每步退出码和日志。`,
    ),
    tsExample(
      '类型感知 ESLint 与 tsc 使用同一项目图',
      `// eslint.config.mjs
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
export default [{
  files: ['src/**/*.ts'],
  languageOptions: {
    parser: tsParser,
    parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
  },
  plugins: { '@typescript-eslint': tsPlugin },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
  },
}];

// src/main.ts
async function save(): Promise<void> { console.log('saved'); }
void save();

// pnpm exec eslint src/main.ts
// 去掉 void 后再次运行`,
      `带 void 时 lint 通过；直接调用 save() 会触发 no-floating-promises。
失败边界：ESLint 的 project 与 tsc 指向不同配置会产生幻影类型；两条命令应共享同一个 tsconfig 根。`,
    ),
    tsExample(
      '测试矩阵覆盖支持的 Node 与 TypeScript 版本',
      `// .github/workflows/ci.yml 的关键矩阵
{
  "strategy": {
    "matrix": {
      "node": [20, 22],
      "typescript": ["5.6.3", "5.7.2"]
    }
  },
  "steps": [
    "pnpm install --frozen-lockfile",
    "pnpm add -D typescript@matrix.typescript",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build"
  ]
}

// 每个 job 保存 packageManager、Node 和 TypeScript 版本
// node --version && pnpm exec tsc --version`,
      `每个矩阵 job 都记录实际 Node 与 TypeScript 版本并运行完整质量门禁。
失败边界：声明支持旧版本却只在最新版测试，消费者会出现无法复现的诊断；支持范围必须有对应 job。`,
    ),
    tsExample(
      '保存制品校验和后再进入发布',
      `// scripts/artifact.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const bytes = readFileSync('acme-order-kernel-1.0.0.tgz');
const sha512 = createHash('sha512').update(bytes).digest('hex');
console.log(sha512);

// pnpm build
// pnpm pack
// node --experimental-strip-types scripts/artifact.ts > artifacts/order-kernel.sha512
// 发布任务只上传这个 tarball，不再重新构建`,
      `脚本输出 tarball 的 sha512，发布任务拿到同一文件与校验和。
失败边界：测试与发布分别构建会产生不同字节；候选制品必须一次生成、校验、上传，并保留可追溯日志。`,
    ),
    tsExample(
      '发布失败不创建 tag 并保留回滚路径',
      `// scripts/release.mjs
import { execFileSync } from 'node:child_process';
try {
  execFileSync('pnpm', ['check:pack'], { stdio: 'inherit' });
  execFileSync('pnpm', ['publish', '--access', 'public'], { stdio: 'inherit' });
  console.log('published');
} catch (error) {
  console.error('release blocked; tag not created');
  process.exitCode = 1;
}

// 模拟 registry 拒绝：设置只写测试 token 后运行
// git tag --list
// npm dist-tag ls @acme/order-kernel`,
      `检查失败时脚本输出 release blocked，退出码为 1，仓库没有新增 tag。
失败边界：先推 tag 再上传会把失败版本固定为发布事件；发布原子性需要 tag、制品和 registry 结果一起协调。`,
    ),
  ],
  '迁移、deprecation 与版本策略': [
    tsExample(
      '公开 API 变化通过报告分类版本',
      `// scripts/version.ts
type Change = { kind: 'add-optional' | 'remove-export' | 'widen-param'; path: string };
const changes: Change[] = [
  { kind: 'add-optional', path: 'parseUser.locale' },
  { kind: 'remove-export', path: 'legacyParse' },
];
const major = changes.filter(change => change.kind !== 'add-optional');
console.log({ major: major.length, minor: changes.length - major.length });

// node --experimental-strip-types scripts/version.ts
// 与 api-report diff 和 changelog 一起评审`,
      `输出 { major: 1, minor: 1 }；删除导出进入主版本，增加可选字段可进入次版本。
失败边界：只看运行时测试会漏掉类型参数收紧；消费者 tsc 失败也必须计入破坏性变化。`,
    ),
    tsExample(
      '兼容别名委托给唯一实现',
      `// src/api.ts
export type User = { readonly id: string; readonly displayName: string };
export function displayName(user: User): string {
  return user.displayName;
}
/** @deprecated 使用 displayName。 */
export function getName(user: User): string {
  return displayName(user);
}

const user = { id: 'u1', displayName: 'Ada' };
console.log(getName(user) === displayName(user));

// npx tsc src/api.ts --strict --declaration --outDir dist
// node dist/api.js
// Get-Content dist/api.d.ts`,
      `两个入口返回相同值，声明文件保留 deprecated 标记，程序输出 true。
失败边界：兼容层若另写一份业务逻辑会逐渐分叉；旧入口只做参数适配并委托唯一实现。`,
    ),
    tsExample(
      '弃用信息进入 JSDoc、README 和运行时指标',
      `// src/deprecation.ts
const seen = new Set<string>();
export function recordDeprecated(api: string): void {
  if (seen.has(api)) return;
  seen.add(api);
  console.log('metric:deprecated:' + api);
}
/** @deprecated 使用 parseV2。 */
export function parseV1(raw: string): string {
  recordDeprecated('parseV1');
  return raw.trim();
}
console.log(parseV1(' a '), parseV1(' b '));

// npx tsc src/deprecation.ts --strict --noEmit
// node --experimental-strip-types src/deprecation.ts`,
      `两次调用都返回结果，但指标只输出一次 metric:deprecated:parseV1。
失败边界：只在 changelog 写弃用不会到达开发者；JSDoc、安装提示和真实调用指标应互相印证。`,
    ),
    tsExample(
      'codemod 先匹配 AST 再替换调用名',
      `// scripts/codemod.ts
import ts from 'typescript';
const source = ts.createSourceFile(
  'fixture.ts',
  "import { getName } from './api.js';\\nconsole.log(getName(user));",
  ts.ScriptTarget.Latest,
  true,
);
const transformer: ts.TransformerFactory<ts.SourceFile> = context => file => {
  const visit: ts.Visitor = node => {
    if (ts.isIdentifier(node) && node.text === 'getName') {
      return context.factory.createIdentifier('displayName');
    }
    return ts.visitEachChild(node, visit, context);
  };
  return ts.visitNode(file, visit) as ts.SourceFile;
};
const result = ts.transform(source, [transformer]);
console.log(result.transformed[0].getText());
result.dispose();

// npx tsc scripts/codemod.ts --strict --noEmit
// node --experimental-strip-types scripts/codemod.ts`,
      `生成的新源码把 getName 改成 displayName，并保留 import 和调用参数。
失败边界：AST 标识符匹配仍可能改到局部同名变量；codemod 要检查导入来源、作用域，并处理无法迁移的拒绝分支。`,
    ),
    tsExample(
      '主版本发布通过 dist-tag 回滚',
      `// 发布前检查
// npm dist-tag ls @acme/order-kernel
// pnpm publish --tag next --access public
// npm dist-tag add @acme/order-kernel@1.9.0 latest

// package.json
{ "name": "@acme/order-kernel", "version": "2.0.0" }

// scripts/verify-tag.mjs
const response = await fetch('https://registry.npmjs.org/-/package/%40acme%2Forder-kernel/dist-tags');
console.log(await response.text());

// node scripts/verify-tag.mjs`,
      `先发布到 next，确认消费者通过后再把 latest 指向新版本；异常时可把 latest 切回 1.9.0。
失败边界：重新上传相同版本号通常被 registry 拒绝；回滚应通过 dist-tag 或发布新补丁，而不是依赖覆盖文件。`,
    ),
  ],
  'TypeScript 企业基础库毕业项目': [
    tsExample(
      '冻结公开入口、错误码和消费者样例',
      `// src/index.ts
export type Order = { readonly id: string; readonly amountCents: number };
export type OrderError = 'INVALID_ID' | 'INVALID_AMOUNT';
export function parseOrder(raw: unknown): Order {
  if (typeof raw !== 'object' || raw === null) throw new Error('INVALID_ID');
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id.startsWith('o-')) throw new Error('INVALID_ID');
  if (typeof row.amountCents !== 'number' || row.amountCents <= 0) throw new Error('INVALID_AMOUNT');
  return { id: row.id, amountCents: row.amountCents };
}
console.log(parseOrder({ id: 'o-1', amountCents: 500 }));

// npx tsc src/index.ts --strict --declaration --emitDeclarationOnly --outDir dist
// Get-Content dist/index.d.ts`,
      `公开声明只包含 Order、OrderError 和 parseOrder，运行输出合法订单对象。
失败边界：公开 API 引用 internal 路径会让消费者安装 tarball 后无法命名类型；冻结清单必须先于实现评审。`,
    ),
    tsExample(
      '领域金额和状态通过 schema 解析',
      `// src/index.ts
import { z } from 'zod';
export const OrderSchema = z.object({
  id: z.string().startsWith('o-'),
  amountCents: z.number().int().positive(),
  status: z.enum(['draft', 'paid']),
});
export type Order = z.infer<typeof OrderSchema>;
const parsed = OrderSchema.parse({ id: 'o-1', amountCents: 500, status: 'paid' });
console.log(parsed);

// pnpm add zod
// npx tsc src/index.ts --strict --noEmit
// node --experimental-strip-types src/index.ts`,
      `合法输入输出 { id: 'o-1', amountCents: 500, status: 'paid' }。
失败边界：schema 只证明结构可信，不证明租户授权或库存充足；领域动作仍需独立业务检查与副作用边界。`,
    ),
    tsExample(
      '类型测试从 dist 声明覆盖公开入口',
      `// test/public.test-d.ts
import { expectTypeOf } from 'expect-type';
import { OrderSchema } from '../dist/index.js';
import type { Order, OrderError } from '../dist/index.js';
expectTypeOf<Order>().toHaveProperty('amountCents');
expectTypeOf<OrderError>().toEqualTypeOf<'INVALID_ID' | 'INVALID_AMOUNT'>();
expectTypeOf(OrderSchema.parse).returns.toMatchTypeOf<Order>();
console.log('dist types ok');

// pnpm build
// pnpm add -D expect-type
// npx tsc test/public.test-d.ts --strict --module NodeNext --noEmit`,
      `公开声明被独立测试锁定，期望结果来自 dist 而不是 src。
失败边界：只测 happy path 不会发现错误码联合被扩宽；类型测试要加强制构建和 tarball 安装。`,
    ),
    tsExample(
      'tsup 输出双格式、子路径和完整声明',
      `// tsup.config.ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/schema.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['zod'],
});

// package.json exports
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./schema": { "types": "./dist/schema.d.ts", "import": "./dist/schema.js", "require": "./dist/schema.cjs" }
  },
  "peerDependencies": { "zod": "^3.23.0" }
}

// pnpm build
// Get-ChildItem dist
// pnpm exec publint`,
      `主入口和 schema 子路径同时生成 ESM、CJS 与声明，publint 检查通过。
失败边界：漏掉 require 或 types 条件会让部分消费者不可用；每个入口都要用真实夹具加载。`,
    ),
    tsExample(
      '发布候选从干净安装到回滚完整演练',
      `// scripts/release-candidate.mjs
import { execFileSync } from 'node:child_process';
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
run('pnpm', ['install', '--frozen-lockfile']);
run('pnpm', ['typecheck']);
run('pnpm', ['lint']);
run('pnpm', ['test']);
run('pnpm', ['build']);
run('pnpm', ['pack']);
run('pnpm', ['check:pack']);
console.log('candidate accepted');

// pnpm exec node scripts/release-candidate.mjs
// npm install ./acme-order-kernel-2.0.0.tgz
// npm dist-tag add @acme/order-kernel@1.9.0 latest`,
      `脚本依次执行冻结安装、类型、lint、测试、构建、打包和包检查，最后输出 candidate accepted。
失败边界：发布现场临时构建会让测试对象和上传制品不同；候选 tarball 必须保存哈希、消费者日志和 dist-tag 回滚命令。`,
    ),
  ],
});

function attachTypeScriptExamples(
  seeds: readonly ProgrammingCourseSeed[],
): readonly ProgrammingCourseSeed[] {
  return seeds.map((seed) => {
    const topic = seed.name.slice(seed.name.lastIndexOf('：') + 1);
    const examples = typescriptExamples[topic] ?? [];
    return {
      ...seed,
      steps: seed.steps.map(([title, body, note], index): ProgrammingStepSeed => {
        const example = examples[index];
        return example
          ? [title, body, note, example]
          : [title, body, note];
      }),
    };
  });
}

export const HANDWRITTEN_TYPESCRIPT_T0_COURSES = attachTypeScriptExamples(TYPESCRIPT_T0_COURSES);
export const HANDWRITTEN_TYPESCRIPT_T1_COURSES = attachTypeScriptExamples(TYPESCRIPT_T1_COURSES);
export const HANDWRITTEN_TYPESCRIPT_T2_COURSES = attachTypeScriptExamples(TYPESCRIPT_T2_COURSES);
export const HANDWRITTEN_TYPESCRIPT_T3_COURSES = attachTypeScriptExamples(TYPESCRIPT_T3_COURSES);
export const HANDWRITTEN_TYPESCRIPT_T4_COURSES = attachTypeScriptExamples(TYPESCRIPT_T4_COURSES);
export const HANDWRITTEN_TYPESCRIPT_T5_COURSES = attachTypeScriptExamples(TYPESCRIPT_T5_COURSES);
