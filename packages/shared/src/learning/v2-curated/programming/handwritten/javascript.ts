// JavaScript 独立语言课程 · J0-J6 逐课手写教案
// 课程名必须与 programs.ts 根据 language-catalogs.ts 生成的名称完全一致。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';

const track = 'P14 · 独立语言课程';
const jsName = (stage: string, topic: string) => `JavaScript · ${stage}：${topic}`;

// ── J0 运行环境、工具链与第一段代码 ─────────────────────────────────────────
const j0Stage = '运行环境、工具链与第一段代码';

const JAVASCRIPT_J0_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: jsName(j0Stage, '浏览器脚本、模块与 Node 进程'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能在终端执行命令，知道 HTML 文件由浏览器加载，并能用 node --version 查看运行时版本。',
    goal: '区分浏览器 window 全局环境、模块环境与 Node 进程环境，能解释同一段 JavaScript 在不同入口下的加载、this 和可用 API。',
    guidedPractice: '分别创建 index.html 中的普通脚本与 type="module" 脚本、使用 node app.mjs 执行模块，打印 globalThis、this、document 与 process 的存在情况；打开 DevTools Network 和终端输出，把三种执行入口的差异整理成表。',
    independentPractice: '把一段只做金额计算的代码抽成 math.mjs，交给浏览器模块和 Node 脚本共同导入；两边各自输出同一组输入的结果，并用 Node 退出码与浏览器控制台错误证明入口差异没有进入计算逻辑。',
    commonErrors: [
      '把浏览器中的 this 或 document 当成所有 JavaScript 运行时都有的对象，迁移到 Node 后立即报 ReferenceError。',
      '在 HTML 里给 type="module" 脚本写 onclick 可见的全局函数，却没有理解模块顶层声明不会自动成为 window 属性。',
    ],
    sourceRefs: [
      'MDN JavaScript modules. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules',
      'Node.js Modules: ECMAScript modules. https://nodejs.org/api/esm.html',
      'WHATWG HTML scripting. https://html.spec.whatwg.org/multipage/scripting.html',
    ],
    steps: [
      [
        '入口决定全局环境',
        '浏览器普通脚本在全局执行环境中运行，顶层 this 通常指向 window，DOM API 可直接使用；type="module" 脚本默认严格模式、延迟执行，顶层 this 是 undefined。Node 入口则由 .mjs 或 package.json 的 type 决定 ESM 语义，process 可用而 document 不存在。失败边界是把仅浏览器可用的名称放进共享模块顶层；验证时在两种入口打印 Object.keys(globalThis) 的子集，并确认哪个名称触发 ReferenceError。',
        '先确认代码到底在哪运行',
      ],
      [
        '共享计算与宿主适配分离',
        '把计算写成不读取 document、window、process 的纯函数，例如 export function total(lines) { return lines.reduce((sum, line) => sum + line.price * line.qty, 0); }。浏览器适配层读取表单值后调用它，Node 适配层读取 argv 或 JSON 后调用同一函数。失败边界是共享模块顶层直接执行 DOM 查询，导入时就崩溃；验证动作是用相同 JSON 输入在两个运行时比较返回值，并用 node --check 检查不会在加载阶段访问宿主对象。',
        '可复用逻辑不绑定宿主',
      ],
      [
        '模块解析不是文件拼接',
        '浏览器模块的相对说明符会按当前模块 URL 解析，通常需要显式 .js 扩展名；裸说明符如 import x from "zod" 必须先由 import map 或打包器处理。Node 对 package.json 的 type、exports 与文件扩展名有独立规则，缺少文件时会抛 ERR_MODULE_NOT_FOUND。失败边界是把本地路径写成目录名或依赖名称却没安装；验证动作是查看 Network 中实际请求 URL，并用 node --trace-warnings app.mjs 确认包解析没有落到错误副本。',
        '每个运行时都有自己的解析规则',
      ],
      [
        '页面生命周期与进程生命周期',
        '浏览器脚本可能挂载 DOMContentLoaded、load 和 visibilitychange，页面卸载后旧监听器不应继续写 UI；Node 进程通常由未完成的 timers、socket 或事件监听维持，完成工作后需清理资源才能自然退出。失败边界是在事件已经触发后才注册监听，或在 Node 中忘了 clearInterval 导致命令不返回；验证动作是记录 performance.now() 附近的顺序日志，并用 process._getActiveHandles() 或诊断报告检查残留句柄。',
        '生命周期由运行时管理',
      ],
      [
        '双运行时验收同一输入',
        '共享模块应提供明确的输入输出边界，浏览器端用模块脚本渲染结果，Node 端以命令行参数或标准输入调用，并让失败返回非零退出码。不要通过修改源码切换环境；用同一份测试样例证明行为一致。失败边界是两端各维护一份算法而逐渐分叉；验证动作是保存样例 JSON，分别运行 node app.mjs fixtures.json 与浏览器页面，比较结果、错误文本和耗时记录，再把命令写进 README。',
        '同输入同输出才算可移植',
      ],
    ],
  },
  {
    name: jsName(j0Stage, 'Node、pnpm、Vite 与目录骨架'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已安装 Node.js 和 pnpm，能区分 package.json 名称、script 名称与终端命令参数。',
    goal: '从空目录建立可由浏览器和 Node 共同使用的 Vite 项目，理解依赖、脚本、锁文件和入口文件的职责。',
    guidedPractice: '依次执行 node --version、pnpm --version、pnpm init、pnpm add -D vite vitest、pnpm exec vite --host，再打开 package.json 对照 dependencies 与 devDependencies；修改 scripts.dev 后运行 pnpm dev，记录每条命令改变的目录和文件。',
    independentPractice: '新建 src/lib、src/web 和 scripts 三个目录，分别放纯函数、浏览器入口与 Node 验证脚本；补全 pnpm dev、pnpm build 和 pnpm test 三个命令，并在删除 node_modules 后执行 pnpm install --frozen-lockfile 验证可重建。',
    commonErrors: [
      '把 package.json 的 name 当成可直接运行的命令，没有通过 scripts 或 pnpm exec 定位入口。',
      '提交 pnpm-lock.yaml 的同时又允许不同开发者随意升级依赖，导致构建结果无法复现。',
    ],
    sourceRefs: [
      'Node.js Download. https://nodejs.org/en/download',
      'pnpm Documentation. https://pnpm.io/',
      'Vite Getting Started. https://vite.dev/guide/',
    ],
    steps: [
      [
        '先核对运行时与包管理器',
        'Node 提供 JavaScript 进程和内置模块，Corepack 或独立安装提供 pnpm；pnpm 管理包解析与磁盘硬链接，Vite 只在开发与构建阶段工作。三条版本命令必须来自 PATH 中的同一环境，node -p "process.execPath" 能暴露实际路径。失败边界是终端中的 Node 来自旧版本，而 Vite 要求的语法或 API 无法运行；验证动作是把 node --version、pnpm --version 与 process.versions 写入项目环境记录，并在 CI 使用固定版本。',
        '版本先对齐再装依赖',
      ],
      [
        '初始化不是生成万能模板',
        'pnpm init 只建立最小 package.json，之后才决定模块类型、依赖和脚本。设置 "type": "module" 会让 .js 按 ESM 解释，devDependencies 中的 Vite 与 Vitest 不应混入生产运行依赖。失败边界是把浏览器包放进 dependencies 又让服务端无条件加载，或遗漏 type 导致 import 语句报语法错误；验证动作是运行 node --check src/lib/math.js，并执行 pnpm exec vite --version 确认命令由本地依赖提供。若清单只写 latest 而锁文件被忽略，团队成员与 CI 会安装到不同提交版本。',
        '每个字段都有运行时后果',
      ],
      [
        '依赖安装与锁文件',
        'pnpm add -D vite 会解析版本、更新 package.json 与 pnpm-lock.yaml，并把包链接进虚拟存储；--frozen-lockfile 要求清单与锁文件完全匹配，适合 CI。失败边界是删除锁文件后重新解析到不兼容的小版本，或在未更新 package.json 时只改 node_modules；验证动作是在干净目录执行 pnpm install --frozen-lockfile，再用 pnpm list --depth 0 核对外层依赖。若只在现有虚拟存储中补包，提交后的清单仍无法复现环境。',
        '锁文件固定整棵依赖树',
      ],
      [
        'Vite 入口和开发服务器',
        'Vite 开发时通过浏览器原生 ESM 按需提供模块，index.html 中写 <script type="module" src="/src/web/main.js"></script> 即可启动链路；生产构建会把依赖分析并输出到 dist。失败边界是入口路径写错后页面返回 404，或直接打开 dist/index.html 却忽略部署基路径；验证动作是运行 pnpm dev 后在 Network 确认 main.js 状态 200，再运行 pnpm build 检查 dist 产物和资源引用。若部署任务直接复制开发缓存，生产 html 会引用不存在的源码路径。',
        '开发和构建使用不同链路',
      ],
      [
        '目录边界与可重建验收',
        'src/lib 只放可测试纯逻辑，src/web 只处理 DOM，scripts 使用 process 与文件系统；scripts 中的 dev、build、test 把命令固定为团队入口。失败边界是所有代码堆进 main.js，浏览器侧 import 到 Node 内置模块；验证动作是删除生成目录后按 README 执行 pnpm install、pnpm test、pnpm build，并在一台干净机器或临时容器重现三步结果。若临时容器必须联网读取开发者缓存，说明依赖边界仍未封闭。',
        '目录边界要能被测试证明',
      ],
    ],
  },
  {
    name: jsName(j0Stage, '变量、表达式、分支与循环'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能读懂赋值、函数调用和简单算术表达式，并会在终端执行 Node 脚本。',
    goal: '正确使用 let、const、表达式、严格相等、truthy/falsy 与循环控制，能为输入边界写出可预测的分支结果。',
    guidedPractice: '在 Node REPL 中依次计算 0 == "0"、0 === "0"、Boolean("0")、[] == false，再把同一判断写成显式比较；用一个 for 循环生成 1 到 5 的平方，加入 continue 跳过偶数并记录每轮 i 的值。',
    independentPractice: '写一个可接收金额和会员等级的函数：未知输入返回 invalid，普通会员按原价，金卡满 100 减 20；用边界值 99、100、101、NaN 和字符串数字验证，并把预期值写成断言。',
    commonErrors: [
      '依赖 == 的隐式转换做业务判断，例如 0 == "0" 为 true，导致字符串输入被误当数字。',
      '在循环里使用 var 保存异步回调所需的下标，回调执行时变量只保留最终值。',
    ],
    sourceRefs: [
      'ECMAScript Equality Operators. https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-equality-operators',
      'MDN Control flow and error handling. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling',
      'MDN Truthy. https://developer.mozilla.org/en-US/docs/Glossary/Truthy',
    ],
    steps: [
      [
        '绑定与可变性',
        'const 约束的是名称不能再次赋值，不表示对象深度不可变；let 允许在同一词法作用域重新赋值，但同一块内重复声明会报 SyntaxError。用 const total = lines.reduce(...) 表达一次计算结果，比 var 的旧函数作用域更容易推理。失败边界是认为 const 对象冻结而继续 push；验证动作是在严格模式下尝试 user = {} 观察 TypeError，并对其属性修改前后做 Object.isFrozen 检查。',
        'const 固定绑定而非内容',
      ],
      [
        '表达式产生值',
        '条件、赋值、函数调用和逗号表达式都会产生值，语句则主要执行动作。`const label = count > 0 ? "有货" : "缺货"` 把选择集中在一处，短路运算 &&、||、?? 会按左值决定是否计算右侧。失败边界是把赋值写进 if 条件造成意外赋值，或让 || 把合法空字符串替换成默认值；验证动作是分别用 0、"" 与 null 测 ?? 和 ||，记录实际分支。',
        '表达式让数据流可见',
      ],
      [
        '真假值与严格比较',
        'JavaScript 只有 false、0、-0、0n、""、null、undefined 与 NaN 是 falsy，字符串 "0" 和空数组都是 truthy。业务输入应先用 Number.isFinite 或显式类型校验，再用 === 比较同类型值；Object.is 还能区分 -0 与 0 以及 NaN。失败边界是把空数组当无数据后进入错误分支；验证动作是写一张包含这些值的测试表，逐项断言 Boolean(value) 与目标比较结果。把接口字段先按字符串解析再比较，可避免浏览器差异造成偶然通过。',
        '不要用模糊真假值代替类型判断',
      ],
      [
        '显式分支覆盖未知输入',
        'if/else 适合互斥条件，switch 适合有限枚举且每个 case 后要 break 或 return，循环应明确初始化、继续条件和状态更新。金额、数量与折扣规则在分支开头先处理非法输入，再进入正常路径。失败边界是漏写 default 或 switch 贯穿导致相邻规则连执行；验证动作是把未知等级作为输入，断言函数返回错误码而不是默认折扣，并覆盖每个 case 至少一次。',
        '分支要覆盖未知输入',
      ],
      [
        '循环作用域与终止证据',
        'for (let i = 0; i < items.length; i += 1) 为每轮创建独立词法绑定，适合直接使用 i；forEach 会在稀疏数组上跳过硬编码下标，不能用于整个过程的 break。处理大集合时先写最大迭代上限或分页条件。失败边界是循环条件永不收敛，或循环内抛出异常导致结果只处理一半；验证动作是记录迭代次数、最后处理项与异常位置，再对空数组和超长输入分别断言耗时或输出。',
        '每次迭代都要可终止',
      ],
    ],
  },
  {
    name: jsName(j0Stage, '函数、作用域与严格模式'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '会声明变量、调用函数和阅读基本运算符，并能运行带参数的 Node 脚本。',
    goal: '理解函数调用契约、参数默认值、词法作用域和严格模式，能定位未声明变量、静默失败与 this 绑定相关错误。',
    guidedPractice: '在 ESM 文件顶部保持 "use strict" 等价的严格语义，编写 joinName(first, last = "")，分别用少传、多传和 undefined 调用；再故意写 undeclared = 1，用 node 运行观察 ReferenceError，并与非严格函数中的静默创建全局变量对比。',
    independentPractice: '把一个依赖外部可变变量的折扣函数改成显式参数，并增加输入校验；分别测试正常值、undefined、负数和字符串，确保错误消息包含字段名且函数不再修改外部状态。',
    commonErrors: [
      '把函数默认参数中的表达式当成每次调用都重新求值，默认值只在参数为 undefined 时使用。',
      '认为 "use strict" 会改变对象属性的全部语义，忽略它主要约束未声明变量、部分 this 绑定和静默写入。',
    ],
    sourceRefs: [
      'ECMAScript Function Definitions. https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html',
      'MDN Strict mode. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode',
      'MDN Closures. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures',
    ],
    steps: [
      [
        '调用契约写在函数边界',
        '函数参数通过位置传入，默认参数只在实参为 undefined 时生效；返回值和抛错共同构成调用契约。把输入校验放在函数开头，能让调用方得到明确错误。失败边界是缺参时返回 NaN 并继续传播，或错误里只有自定义字符串没有字段；验证动作是对每个必填参数调用一次缺失用例，断言抛出 TypeError，并检查正常调用的返回类型。',
        '边界校验先于核心计算',
      ],
      [
        '词法作用域在定义处确定',
        '函数可以读取定义位置外层的绑定，而不是调用位置的外层绑定；同名内层变量会遮蔽外层变量，块级 let、const 又只活在自己的花括号内。用明确参数代替随手读取全局变量，可以减少隐式依赖。失败边界是回调读取循环变量时得到意外值，或函数内修改外层缓存；验证动作是打印函数内解析到的值，并把变量移到不同块中执行同一调用，观察结果是否变化。',
        '作用域看定义位置',
      ],
      [
        '严格模式让错误显形',
        '浏览器模块和 Node ESM 默认就是严格模式；非 strict 的普通函数中写 undeclared = 1 会创建全局变量，严格模式则抛 ReferenceError，给只读属性赋值也会抛 TypeError。失败边界是把旧脚本直接搬进严格模块，却仍依赖 with 或静默失败；验证动作是运行 node --input-type=module -e "undeclared=1"，确认非零退出，再在函数内部逐项检查是否出现隐式全局。',
        '严格模式拒绝静默错误',
      ],
      [
        '声明提升与暂时性死区',
        'var 声明会提升到函数或全局作用域，初始值为 undefined；let 与 const 也会被创建但处于暂时性死区，直到声明语句执行后才能访问。函数声明在块内和严格模式下的行为要按词法环境理解，不要依赖调用早于声明。失败边界是在初始化前读取 let 变量得到 ReferenceError，或把 var 的提升误当成值可用；验证动作是把声明顺序故意倒置，捕获错误并打印 name，确认不属于原先以为的 undefined。',
        '提升的是绑定而非可用值',
      ],
      [
        '模块即作用域边界',
        'ESM 模块中的顶层变量默认不会暴露到 window，只导出明确标记的绑定；模块之间通过 import/export 形成静态依赖图，循环依赖时会拿到尚未初始化的绑定。把函数、常量与副作用分开导出，入口文件只负责组装。失败边界是依赖方在模块初始化阶段访问循环导入中的值；验证动作是画出 import 边、运行 node --trace-warnings，并通过一个只导入函数不执行 DOM 的测试验证模块无副作用。',
        '模块边界默认私有',
      ],
    ],
  },
  {
    name: jsName(j0Stage, '控制台、断点与 Source Map'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '会打开浏览器 DevTools，并能运行 Node 脚本、查看标准输出与退出码。',
    goal: '使用 console 分级、断点、watch、调用栈与 Source Map 定位 JavaScript 错误，能把模糊现象收敛成可复现输入。',
    guidedPractice: '在 Vite 页面中打开 Sources，给事件处理函数设置断点，查看 Scope、Call Stack 和 Watch；再在浏览器 console 执行 console.table、console.group、console.time，故意制造一次 TypeError，并沿 Source Map 定位到原始 src 文件。',
    independentPractice: '为一段金额计算脚本制造 off-by-one 与 NaN 两类缺陷，分别用 Node inspect 与浏览器断点定位；保存触发输入、异常堆栈、修复前后输出和一条最小复现命令。',
    commonErrors: [
      '只看 console.log 的最后一条信息，没有检查异常堆栈中的第一个业务帧。',
      '生产构建关闭 Source Map 后仍按压缩文件名猜测错误位置，导致修复目标错误。',
    ],
    sourceRefs: [
      'Chrome DevTools JavaScript debugging. https://developer.chrome.com/docs/devtools/javascript/',
      'MDN Console. https://developer.mozilla.org/en-US/docs/Web/API/console',
      'Source Map Revision 3. https://tc39.es/source-map/',
    ],
    steps: [
      [
        '日志要有级别与上下文',
        'console.log 适合普通信息，console.warn 与 console.error 分别表达可恢复警告和失败；console.table 适合数组对象，console.time/timeEnd 适合局部计时。日志应带请求 ID、输入摘要和阶段名，且不能把 Authorization 或真实用户数据直接打印。失败边界是日志过多却缺少关键输入，或敏感字段进入生产日志；验证动作是触发一条成功与一条失败流程，确认日志能按同一个 ID 串起来且秘密扫描无命中。',
        '日志是可检索的证据',
      ],
      [
        '断点胜过反复猜测',
        '在 DevTools Sources 的原始文件行号处设置断点，刷新后检查 Locals、Closure 与 Global 作用域；F8 继续、F10 单步跳过、F11 进入函数，右侧 Call Stack 能显示调用路径。断点只在代码实际执行到该行时触发。失败边界是把断点设在不会命中的旧构建或事件发生前；验证动作是先在入口打印标记，再点击实际操作确认断点暂停位置与预期事件一致。',
        '让执行停在问题之前',
      ],
      [
        'Source Map 还原源码位置',
        'Vite 开发构建会提供 devtool 映射，浏览器 Sources 面板可展开 webpack 或 Vite 模板还原原始文件；生产 Source Map 的暴露策略要明确，通常只上传给受控监控服务而不公开静态目录。映射依赖 sourcesContent、源文件版本与构建产物一致。失败边界是部署新脚本却沿用旧 map，导致行号错位；验证动作是故意在 src 中抛错，确认堆栈能指回原名和原行，并核对构建 ID 与 map 版本。',
        '映射要和产物同版本',
      ],
      [
        '异步栈与错误对象',
        'Promise 拒绝会形成异步调用链，DevTools 的 Async 调用栈可以显示 await 前后的路径；错误应保存 name、message、stack、cause 与业务 code，而非只保留字符串。捕获后重新抛出时用 throw new Error("...", { cause: error }) 保留因果链。失败边界是 catch 中吞掉错误并继续返回成功结果；验证动作是制造一个内层 fetch 失败，确认最终日志能看到最内层 cause、外层阶段和完整 stack。',
        '异步错误也要保留因果链',
      ],
      [
        '条件断点与最小复现',
        '当循环次数很多时，在行号旁选择 Add conditional breakpoint，例如 user.id === "u-42"，只在目标输入停下；还可以使用 logpoint 在不暂停的情况下输出表达式。最小复现要锁定输入、版本、入口和第一条异常帧。失败边界是条件表达式本身抛错，使断点永不触发；验证动作是先用 console.log 验证条件表达式求值，再确认修复后同一条件断点不再命中错误分支。',
        '条件断点缩小搜索空间',
      ],
    ],
  },
  {
    name: jsName(j0Stage, '第一段可测试 JavaScript 程序'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已能用 let、const、函数、分支和循环写小脚本，并能执行 pnpm 命令。',
    goal: '把一个小需求拆成纯函数、宿主适配和测试三层，用 Vitest 覆盖正常与失败路径，并交付可从命令行和页面重复验证的程序。',
    guidedPractice: '实现 normalizeLines(input)：把空白行剔除、数字字符串转金额、未知等级归一化；先写三个会失败的 Vitest 用例，再补实现到全部通过，并在 Vite 页面用同一函数渲染总额。',
    independentPractice: '独立完成一个购物清单小工具，要求包含输入解析、折扣计算、错误提示和结果展示；至少写正常、空输入、非法金额、边界折扣四组测试，并让 pnpm test 与 pnpm build 同时通过。',
    commonErrors: [
      '把 DOM 查询写在纯函数里，导致 Node 测试无法导入模块，只能用手工点击验证。',
      '测试只覆盖顺利输入，没有验证空数组、NaN、重复提交和错误返回。',
    ],
    sourceRefs: [
      'Vitest Guide. https://vitest.dev/guide/',
      'MDN JavaScript Guide. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
      'Vite Guide. https://vite.dev/guide/',
    ],
    steps: [
      [
        '把需求写成输入输出契约',
        '先用一句话写清函数接收什么、返回什么、失败时抛什么。例如 parseAmount(value): number 只接受有限数字或非空数字字符串，其他情况抛 RangeError；结果对象再带 subtotal、discount 与 total。失败边界是不同输入返回 string、number 混在一起，调用方无法稳定比较；验证动作是列出至少五个输入样例，先确认每个样例的预期类型与错误类型，再开始写实现。',
        '先固定契约再写代码',
      ],
      [
        '纯函数承载业务规则',
        '解析、校验、折扣和汇总放在 src/lib，函数不读取 document、window 或 Date.now；需要时间时把现在的时间作为参数传入。这样同一个输入可以在浏览器、Node 和测试中得到相同输出。失败边界是隐藏全局状态导致连续调用结果不同；验证动作是连续两次调用同一函数并断言 Object.is 比较的结果一致，再在 Node 与浏览器各跑一次样例。',
        '纯函数让结果可比较',
      ],
      [
        '宿主适配只做输入输出',
        '浏览器适配层负责 querySelector、事件监听与文本渲染，Node 适配层负责读取文件和 process.exitCode；它们都不复制业务公式。用户输入经过 trim 与校验后传给纯函数，异常转换成可读提示。失败边界是适配层把所有错误都显示成“提交失败”，掩盖具体字段；验证动作是分别触发空值和非法金额，确认页面显示不同错误，同时纯函数测试直接断言错误类型。',
        '适配层只连接界面与核心',
      ],
      [
        '用 Vitest 锁定边界',
        '测试文件写 import { describe, expect, it } from "vitest"，用 expect(calculate([])).toEqual({ total: 0 }) 锁定空输入，用 expect(() => parseAmount("abc")).toThrow(RangeError) 锁定失败路径。每个测试独立创建输入，不共享可变对象。失败边界是测试依赖执行顺序或真实网络；验证动作是单独运行 pnpm exec vitest run src/lib/cart.test.js，并故意改坏一个分支确认测试能指出具体用例。对异常消息和错误类型同时断言，才能区分实现抛错与测试在赋值阶段失败。',
        '测试要能失败也有意义',
      ],
      [
        '从本地通过到可交付',
        '收口时运行 pnpm test、pnpm build，并在一台干净环境检查锁文件安装；页面至少演示正常、空输入和非法输入三种结果，命令行的退出码应为 0 或明确的 1。README 写清安装、运行和验证命令，避免依赖开发者终端里未记录的全局工具。失败边界是只看页面成功截图，没有测试和构建证据；验证动作是把命令输出、测试数量和浏览器路径一起记录为交付清单。',
        '可重复运行才叫完成',
      ],
    ],
  },
];

// ── J1 类型、对象、作用域与闭包 ─────────────────────────────────────────────
const j1Stage = '类型、对象、作用域与闭包';

const JAVASCRIPT_J1_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: jsName(j1Stage, '原始值、对象与隐式转换'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已能声明变量、使用比较运算符，并能在控制台观察表达式的返回值。',
    goal: '区分七种原始类型与对象引用，解释装箱、隐式转换和相等比较，能在业务输入边界强制使用可预测的类型。',
    guidedPractice: '在浏览器控制台依次执行 typeof null、typeof (() => {})、[] + []、[] + {}、Number("")、Boolean("false")，再用 Object(1) 观察 Number 包装对象；把容易误判的例子抄成输入、转换结果与最终类型三列表。',
    independentPractice: '写一个 parseQuantity(input)：只接受安全整数或可完整解析的十进制字符串，拒绝数组、NaN 和 "1abc"；用 typeof、Number.isSafeInteger、String.prototype.trim 组合实现，并覆盖至少八个欺骗性输入。',
    commonErrors: [
      '把 typeof null 的结果 "object" 当作 null 可以有属性，实际 null 是原始值。',
      '用 Boolean("false") 判断字符串输入，结果因为非空字符串为真而进入错误分支。',
    ],
    sourceRefs: [
      'ECMAScript Data Types and Values. https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html',
      'MDN JavaScript data types and data structures. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures',
      'MDN Type coercion. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#type_coercion',
    ],
    steps: [
      [
        '原始值按值保存',
        'undefined、null、boolean、number、bigint、string、symbol 是原始值，赋值给另一个名称时复制的是值语义；对象、数组和函数则是引用值，多个名称可以指向同一堆对象。typeof 对 null 返回 object 是历史兼容行为，Number.isNaN 与 Object.is(NaN, NaN) 能替代错误的 === 判断。失败边界是把 null 与空对象都当作无数据；验证动作是用 Object.is 与 === 分别比较 NaN、-0 和 0，并把结果写进断言。',
        '先分清值语义与引用语义',
      ],
      [
        '装箱让原始值借用方法',
        '字符串和数字本身没有可变属性，访问 "abc".length 时 JavaScript 会临时创建包装对象再取属性；这不是把原始值升级成永久对象。Object(1) 能显式构造 Number 包装对象，typeof 结果会变成 object。失败边界是用包装对象参与相等比较，得到令人意外的对象语义；验证动作是比较 1 === 1 与 1 === new Number(1)，并在真值判断中分别观察 Boolean 结果。',
        '方法借用不等于改变原值',
      ],
      [
        'ToPrimitive 驱动转换',
        '算术和加号会触发 ToPrimitive：对象先尝试 Symbol.toPrimitive，再尝试 valueOf 与 toString；数组转字符串通常走 join，所以 [] + [] 得到空串，[] + {} 得到 "[object Object]"。显式的 Number(value) 和 String(value) 是转换入口，但通过仍然可能与预期不同。失败边界是把对象直接拼进用户可见文本；验证动作是对数组、对象、null 分别调用 Number 和 String，并记录每一列实际类型。自定义对象的 Symbol.toPrimitive 返回非原始值时还会继续抛 TypeError。',
        '转换规则有明确优先级',
      ],
      [
        '相等比较选择同语义',
        '=== 要求类型相同且值相等，== 会执行复杂转换，例如 0 == "0" 为 true；null == undefined 为 true，但 null == 0 为 false。对象比较使用引用同一性，两个内容相同的数组也不相等。失败边界是用 == 比较来自 JSON 的字符串与本地数字；验证动作是把 API 输入先转换为目标基础类型，再统一使用 ===，并用包含 null、undefined、0 的表驱动测试验证。',
        '业务比较固定为同类型',
      ],
      [
        '输入解析要可逆',
        'parseQuantity 先判断原始类型，拒绝对象与数组；字符串必须 trim 后非空，再用正则或 Number 检查有限安全整数；数字本身也要 Number.isSafeInteger。返回结果最好同时给出值或错误，不把 NaN 当合法结果。失败边界是 "1e3" 被意外接受而业务只允许三位整数；验证动作是把每个接受样例转回字符串再解析，确认结果稳定，并断言拒绝样例的错误码。',
        '解析成功必须能解释原因',
      ],
    ],
  },
  {
    name: jsName(j1Stage, 'let、const、提升与暂时性死区'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已经理解函数、块语句和作用域的基本概念，能在严格模式下运行 Node 模块。',
    goal: '掌握 let、const、var 的声明环境差异，解释暂时性死区、重复声明与块级闭包，能重构依赖提升的易错代码。',
    guidedPractice: '在同一个 ESM 文件中分别写 var、let、const 的声明前后访问，使用 node 运行并记录 ReferenceError 与 undefined；再在 for 块中创建三个回调，分别使用 var 与 let，打印回调执行时拿到的值。',
    independentPractice: '把一个使用 var 的函数重构成 let/const 版本：为每个循环回调保留独立值，阻止块外访问，并用 Object.freeze 保护不应修改的配置对象；补两组测试验证外层访问失败与回调输出顺序。',
    commonErrors: [
      '认为 const 变量在声明前可以使用 undefined，忽略 let/const 的暂时性死区会抛 ReferenceError。',
      '在循环中让回调闭包捕获 var，所有回调最终读取同一个已经变化的变量。',
    ],
    sourceRefs: [
      'ECMAScript Lexical Environments. https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html',
      'MDN let. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let',
      'MDN const. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const',
    ],
    steps: [
      [
        '声明与初始化分离',
        'let 和 const 在控制流进入作用域时创建绑定，但只有执行到声明语句才初始化；声明之前访问处于暂时性死区，会抛 ReferenceError。var 的绑定会提升并初始化为 undefined，函数声明则存在额外的创建阶段。失败边界是把初始化顺序写在条件分支里，某些路径跳过声明后继续使用；验证动作是把声明放进不会执行的 if 分支，确认访问时错误位置指向具体绑定。',
        '绑定存在不等于可以读取',
      ],
      [
        '块级作用域限制泄漏',
        'let 和 const 以最近的花括号块为作用域，if、for、try 都能形成独立环境；var 只遵循函数或全局边界，容易泄漏到循环之后。把临时变量留在最小块内，可以让垃圾回收范围更清楚，并减少命名冲突。失败边界是块外引用循环内部变量，得到 ReferenceError；验证动作是分别在块内外读取同一名称，记录错误与正常路径，并检查编译工具是否报告重复声明。',
        '变量只活在需要它的块里',
      ],
      [
        'const 不是深冻结',
        'const config = { retries: 2 } 禁止重新绑定 config，但 config.retries = 3 仍然可以执行；需要不可变快照时可用 Object.freeze，或复制新对象后修改。数组同样可以被 push，除非冻结或使用只读约定。失败边界是把安全配置交给下游后仍被就地修改；验证动作是尝试重新赋值与修改属性，分别观察是否抛错，并用 Object.isFrozen 检查冻结是否真的生效。',
        '禁止重绑不等于禁止修改',
      ],
      [
        '循环闭包捕获词法绑定',
        'for (var i = 0; i < 3; i += 1) 的 i 属于函数作用域，回调执行时只看到最终值 3；for (let i = 0; i < 3; i += 1) 每轮创建新的绑定，输出为 0、1、2。异步回调真正执行时要看队列时机，而不是循环完成瞬间。失败边界是混用 var 与异步请求后把错误归因给 Promise；验证动作是把回调改为 Promise 或 setTimeout，记录每个回调的输出并和迭代值逐一比对。',
        '每轮绑定决定回调结果',
      ],
      [
        '用结构消除提升依赖',
        '把初始化放在使用之前，把函数定义与调用放在同一可读区域，拒绝在声明之前读取变量；公共入口只做参数校验和调用，内部实现按依赖顺序排列。失败边界是依赖函数提升掩盖循环依赖，或初始化顺序改变后出现暂时性死区；验证动作是运行 ESLint 的 no-use-before-define 规则，并故意改变模块加载顺序，确认代码不依赖偶然的声明位置。',
        '顺序应来自依赖而非运气',
      ],
    ],
  },
  {
    name: jsName(j1Stage, '闭包、工厂函数与私有状态'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能声明函数、参数和块级变量，并理解函数会从定义位置读取外层绑定。',
    goal: '使用闭包封装状态，区别工厂函数返回的方法共享什么，并用显式接口控制可变状态的生命周期和清理。',
    guidedPractice: '写一个 createCounter(initial = 0)，返回 increment、decrement 与 read 三个函数；连续调用后检查 read，故意从外部修改 initial，再比较不同计数器实例是否互不影响，并打印闭包在 DevTools 中的作用域。',
    independentPractice: '实现 createRateLimiter(limit, windowMs)：内部保存时间戳数组，返回 canRun() 和 reset()；为跨窗口、连续调用和多个实例写测试，证明外部无法直接篡改内部数组。',
    commonErrors: [
      '把工厂函数内部变量直接挂在返回对象上，外部可以任意修改状态，破坏封装目的。',
      '在事件监听器内创建闭包却不解除监听，导致组件卸载后仍持有 DOM 和状态对象。',
    ],
    sourceRefs: [
      'MDN Closures. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures',
      'ECMAScript Function Objects. https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html#sec-function-objects',
      'MDN Memory management. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management',
    ],
    steps: [
      [
        '闭包保存外层引用',
        '内层函数会引用创建时的词法环境，因此外层函数返回后，increment 仍然能访问 count；保存的是绑定和对象引用，不是函数执行时的快照。每次调用 createCounter 都会创建新的环境，所以两个实例的 count 独立。失败边界是误以为闭包复制了对象，实际多个方法共享同一底层可变状态；验证动作是打印每个实例连续调用的结果，并在堆快照中确认实例之间没有互相引用。',
        '闭包捕获的是绑定',
      ],
      [
        '工厂函数暴露最小接口',
        'return { increment() { count += 1; }, read() { return count; } } 只公开操作，不公开原始变量；调用方通过 read 观察状态而非直接赋值。接口命名要表达意图，避免同时暴露 set 和直接修改内部对象。失败边界是把内部数组通过 getter 原样返回，调用方 mutate 后绕过校验；验证动作是从外部尝试修改返回值，确认内部状态不变，并为非法状态转换断言错误。',
        '公开行为而非存储细节',
      ],
      [
        '每个实例独立初始化',
        '工厂调用时创建的局部变量属于该调用环境，默认参数也应按调用重新求值；如果默认值是可变对象，要每次新建，不能共享同一个数组。createRateLimiter(5, 60000) 的两个实例应各有时间戳窗口。失败边界是把缓存放到模块顶层，不同租户共用彼此状态；验证动作是创建两个实例分别触发限流，确认一个实例耗尽额度不会影响另一个实例。',
        '实例状态不要写成模块状态',
      ],
      [
        '时间与清理属于闭包接口',
        '带定时器或监听器的工厂应返回 stop 或 dispose，在 stop 内 clearInterval、removeEventListener 并清空引用；否则闭包会一直持有 DOM、网络请求和业务数据。失败边界是页面已经卸载但定时器仍调用旧节点；验证动作是调用 stop 后等待两个周期，确认计数不再变化，再用浏览器 Memory 快照比较组件卸载前后的监听器数量。',
        '谁能启动谁就负责停止',
      ],
      [
        '用测试证明状态隔离',
        '测试 createCounter 和 createRateLimiter 时分别创建实例，断言第一个实例操作不会改变第二个；测试读取接口后无法直接替换内部值，非法输入会抛错。测试不共享时间，可把 now 注入工厂以避免依赖真实时钟。失败边界是所有用例共用顶层实例，导致顺序影响结果；验证动作是单独运行每个用例、打乱文件顺序，并断言对象之间没有相等引用。',
        '隔离要靠测试而不是注释',
      ],
    ],
  },
  {
    name: jsName(j1Stage, '解构、展开、可选链与空值合并'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能读写对象与数组，区分 undefined、null、false 和空字符串，并会调用函数。',
    goal: '使用解构表达字段契约，利用展开创建新结构，正确区分可选链与空值合并，避免丢失原型和误把合法空值当缺失。',
    guidedPractice: '从一个包含 user.profile.name 与 tags 的响应对象中解构字段，给默认值并重命名；用 arr.map、对象 spread 生成 UI 状态，再分别比较 value || fallback 和 value ?? fallback 在 "", 0, false 下的结果。',
    independentPractice: '写一个 renderUser(input)：接收不可信对象，解构 userName 与 address.city，缺失时返回缺失字段列表；用展开生成新对象，不修改原对象，并用可选链处理可选嵌套属性。',
    commonErrors: [
      '对可能为 null 的中间值直接使用 user.profile.name，导致读取属性前就抛出 TypeError。',
      '用 || 给默认值，把合法的 0、空字符串或 false 替换成默认值，改变业务含义。',
    ],
    sourceRefs: [
      'MDN Destructuring assignment. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment',
      'MDN Spread syntax. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax',
      'MDN Optional chaining. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining',
    ],
    steps: [
      [
        '解构是读取字段的契约',
        'const { id, profile: { name } = {} } = user 读取嵌套字段，默认值只在对应值为 undefined 时使用；如果 profile 本身是 null，默认值不会替它遮住空值。解构时可重命名，避免 name 冲突。失败边界是层级假设超出真实 API，或把 null 当缺失；验证动作是准备缺少 profile、profile 为 null、name 为空串三组输入，观察每一组是否进入默认分支并修正条件。读取前先确认 user 是对象且不为 null，比事后捕获属性错误更能定位数据来源。',
        '默认值只处理 undefined',
      ],
      [
        '数组解构保留位置语义',
        'const [first, , third] = list 按位置读取，剩余元素可用 rest 收集；对象解构按属性名读取，不依赖顺序。对可能为空的数组先判断 Array.isArray，再进行解构，避免 list 为 null 时直接报错。失败边界是把对象当数组解构，得到 undefined 后继续调用方法；验证动作是用 [{}, []] 两类输入执行同一函数，并把失败位置定位到明确的字段校验。',
        '位置与名称要分清',
      ],
      [
        '展开只做浅层复制',
        'const next = { ...state, user: { ...state.user, name } } 会创建新外层与新的 user 对象，但嵌套数组或其他引用仍共享；数组 spread 也只是复制元素引用。React 或普通状态更新要逐层展开需要改变的路径。失败边界是只展开顶层就修改内部对象，导致旧快照同步变化；验证动作是修改 next.user 与 next.items[0] 后分别检查 state 的对应字段，并用 Object.is 标记哪些引用被复用。',
        '展开不是深拷贝',
      ],
      [
        '可选链只在左侧存在时继续',
        'user?.profile?.name 在 user 为 null 或 undefined 时短路为 undefined，但 user.profile 为 null 时若继续用 name 仍会失败；user?.profile.name 不会保护 profile。函数调用可写 user?.getName?.()，可选链结果参与逻辑时要再判断。失败边界是把可选链用于必然存在的核心对象，掩盖数据契约错误；验证动作是对 null、缺失、空对象与正常对象分别调用，记录返回值和抛错点是否精准。',
        '可选链不是万能空值处理',
      ],
      [
        '?? 只替换空值',
        'const limit = input.limit ?? 10 只在 input.limit 为 null 或 undefined 时取 10，0 与 false 会保留；而 input.limit || 10 会把 0 和 false 替换掉。?? 不能与 || 或 && 无括号混用，应写清分组。失败边界把合法空字符串当成缺失，导致筛选条件改变；验证动作是写 0、false、""、null、undefined 五元组测试，断言每个表达式的结果并检查代码审查时的运算符优先级。如果输入必须是有限数字，还应在取默认值后运行 Number.isFinite 校验。',
        '缺失与合法取假要分开',
      ],
    ],
  },
  {
    name: jsName(j1Stage, '浅拷贝、深拷贝与结构化克隆'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解对象引用、展开运算符和 JSON 数据，能运行浏览器控制台与 Node 脚本。',
    goal: '按数据形态选择浅拷贝、JSON 序列化或 structuredClone，识别它们对函数、类实例、循环引用、Map/Set 和不可克隆对象的不同结果。',
    guidedPractice: '构造含 Date、Map、undefined、循环引用和类实例的对象，分别执行 Object.assign、JSON.parse(JSON.stringify(obj))、structuredClone(obj)；逐项检查类型、引用和抛错，并复制前后对象的内部引用做比较。',
    independentPractice: '为一个编辑器状态设计 cloneState：普通可序列化数据用 structuredClone，含不可克隆句柄的部分显式排除并返回错误或降级值；测试修改副本的嵌套数组不会影响原状态，同时记录哪些字段仍共享。',
    commonErrors: [
      '用 JSON 序列化做深拷贝，结果静默丢掉 undefined、函数、Symbol 和 Map/Set，并把 Date 变成字符串。',
      '把对象展开当成深拷贝，修改副本的第二层数组后原对象也被污染。',
    ],
    sourceRefs: [
      'MDN Object.assign. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign',
      'MDN structuredClone. https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone',
      'MDN JSON.stringify. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify',
    ],
    steps: [
      [
        '浅拷贝共享下一层',
        'const copy = { ...source } 或 Object.assign({}, source) 只复制顶层可枚举自有属性，source.items 与 copy.items 仍指向同一数组；修改 copy.items.push 会同时改变两者。展开适合构造新配置对象，但不适合作为持久状态快照。失败边界是把浅拷贝结果存进历史记录后继续修改数组；验证动作是修改副本的嵌套字段，再用 Object.is 比较两层引用，明确记录哪一层隔离。',
        '先确认要隔离哪一层',
      ],
      [
        'JSON 往返有丢失规则',
        'JSON.stringify 会调用 toJSON，忽略 undefined、函数和 Symbol，Map/Set 变成普通对象或空对象，Date 变成 ISO 字符串，NaN 与 Infinity 变成 null；循环引用会直接抛 TypeError。它适合合法 JSON 数据的传输，不适合通用对象克隆。失败边界是用户数据经过 JSON 后类型改变却未重新校验；验证动作是对每种特殊值做往返比较，确认抛错或丢字段的具体位置。',
        'JSON 不是对象复印机',
      ],
      [
        'structuredClone 覆盖更多类型',
        'structuredClone(value) 使用结构化克隆算法，能复制 Date、Map、Set、ArrayBuffer 和循环引用，并能保留对象内这些类型的关系；它不复制函数、DOM 节点、Promise 或带私有槽的宿主对象，遇到不可克隆值会抛 DataCloneError。失败边界是跨窗口传递后仍假设原型方法存在；验证动作是构造可克隆与不可克隆两组数据，断言成功值的嵌套引用已分离，失败组捕获 DataCloneError。',
        '克隆算法决定可用类型',
      ],
      [
        '原型方法不会自动保留',
        'structuredClone 复制数据但不会恢复自定义 class 的原型，结果通常是普通对象；需要类行为时应在克隆后重新构造领域对象或提供 fromJSON。失败边界是代码继续调用 clone.toCents()，但方法为 undefined；验证动作是检查 Object.getPrototypeOf(clone) 与原实例并比较，再用 instanceof 或显式工厂把数据重新实例化。若业务依赖类方法，应在反序列化边界集中恢复，而不是在调用点临时补方法。',
        '复制数据不等于复制行为',
      ],
      [
        '按风险选择克隆策略',
        '决策顺序是：先确认数据是否跨线程或跨窗口，再列出不可克隆字段，最后决定浅拷贝、结构化克隆或专用序列化。编辑器历史状态应显式排除 DOM 节点、AbortController 等宿主句柄，并将错误展示给调用方。失败边界是深层递归手写 clone 导致栈溢出；验证动作是对深层嵌套、循环引用、Map 和函数各跑一组用例，并记录深拷贝后的内存与耗时。',
        '先列字段再选算法',
      ],
    ],
  },
  {
    name: jsName(j1Stage, '作用域和闭包缺陷实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已理解函数、块级声明、闭包和异步回调，能使用 Vitest 或浏览器控制台检查状态。',
    goal: '通过可重复实验识别变量泄漏、共享闭包、回调捕获和监听器残留四类缺陷，并能用最小改动修复与回归验证。',
    guidedPractice: '构造五个按钮的循环监听器：先用 var 触发所有点击报告 i=5，再改为 let 得到独立编号；另写一个共享累加器的闭包，让两个调用方互相影响，使用 DevTools Scope 与 console.trace 记录根因。',
    independentPractice: '对一个订阅函数做故障注入：取消订阅后再次触发事件、重复注册监听器、页面卸载后定时器再执行；分别写出失败测试，再重构为 idempotent unsubscribe，验证资源数量归零。',
    commonErrors: [
      '看到回调输出相同就只改循环变量名，没有检查回调实际执行时机和绑定来源。',
      '取消订阅只清数组，没有移除事件监听器或定时器，闭包仍持有旧状态。',
    ],
    sourceRefs: [
      'MDN Closures. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures',
      'MDN EventTarget.removeEventListener. https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/removeEventListener',
      'Chrome DevTools memory. https://developer.chrome.com/docs/devtools/memory-problems/',
    ],
    steps: [
      [
        '先观察回调何时执行',
        '回调中的取值由函数执行时的词法环境和绑定状态决定，不是循环写出回调时的瞬时快照。用 setTimeout 或队列任务放大时间差，分别打印 i、按钮编号与事件对象，才能区分变量泄漏与执行顺序。失败边界是只打印最终值，误以为所有回调拿到了同一对象；验证动作是给每个回调附加唯一标记，记录触发前后顺序，并与预期编号表逐行比较。',
        '时间会暴露绑定问题',
      ],
      [
        '词法绑定修复捕获',
        '把 var 改为 for (let i...)，每轮绑定独立；若必须使用 ES5 结构，可在循环体调用 makeHandler(i)，再由工厂返回捕获参数的回调。不要用闭包读取全局 currentId 来伪装修复。失败边界是工厂仍然读取外层 i，参数只是换了名字；验证动作是在异步任务执行前修改外层 i，确认最终输出仍保持各自的期望编号。',
        '每个回调需要自己的绑定',
      ],
      [
        '共享状态要暴露边界',
        'createStore 的一个闭包若被多个组件直接复用，clear、increment 会互相影响；给每个调用创建独立实例，或明确设计成全局单例并记录访问者。状态对象不要通过 getter 原样返回，必要时返回只读快照。失败边界是测试顺序不同导致结果波动；验证动作是创建两个 store，交错调用后分别断言，并用 Object.is 证明返回快照不共享可变数组。',
        '共享是设计选择不是偶然',
      ],
      [
        '监听器与定时器必须可撤销',
        '订阅函数应保存 element、eventName、handler 与 timer 的引用，unsubscribe 内调用 removeEventListener 和 clearInterval；同一个 handler 才能被移除，匿名箭头函数每次都会被视为新函数。unsubscribe 要可重复调用。失败边界是清理函数抛错导致后续资源没有释放；验证动作是连续调用两次 unsubscribe 不抛错，并检查事件中心监听器数量与待执行定时器都回到零。',
        '清理函数也必须幂等',
      ],
      [
        '故障实验形成回归',
        '在 Vitest 中用 vi.useFakeTimers 控制时间，触发订阅、取消、再次触发和卸载四步；每个断言只验证一个可观察结果，如 handlerCalls 不再增加、store 状态不变或错误被记录。把失败样例保留在测试名里。失败边界是真实计时让测试偶发通过或失败；验证动作是单独运行用例、连续运行十次，并通过 DevTools Memory 快照确认旧订阅没有继续引用组件。',
        '缺陷要变成长期测试',
      ],
    ],
  },
];

// ── J2 原型、类、this 与对象设计 ─────────────────────────────────────────────
const j2Stage = '原型、类、this 与对象设计';

const JAVASCRIPT_J2_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: jsName(j2Stage, '对象属性、描述符与原型链'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已理解对象引用、属性读取和函数，并能使用 Object.keys、Object.getPrototypeOf 观察对象。',
    goal: '解释自有属性、继承属性与原型链查找，能使用属性描述符控制可枚举、可写和可配置行为，并安全选择 Object.create 或对象组合。',
    guidedPractice: '执行 const base = { role: "reader" }; const user = Object.create(base); 后分别打印 user.role、Object.keys(user) 与 Object.getPrototypeOf(user)，再用 Object.defineProperty(user, "role", { value: "admin", enumerable: true, writable: false }) 观察遮蔽与写入失败。',
    independentPractice: '给一个配置对象定义 duration 访问器：读取时钟并返回经过秒数，存储字段不可枚举；写测试验证内部字段不出现在 Object.keys、修改只读属性失败，并证明两个实例没有共享同一个基对象状态。',
    commonErrors: [
      '只用 Object.keys 检查属性是否存在，漏掉原型链上可读取但不可枚举的字段。',
      '认为给只读数据属性赋值一定抛错，在严格模式外可能静默失败并留下旧值。',
    ],
    sourceRefs: [
      'ECMAScript Ordinary Object Internal Methods. https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html',
      'MDN Object.defineProperty. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty',
      'MDN Object.getPrototypeOf. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getPrototypeOf',
    ],
    steps: [
      [
        '自有属性与继承属性不同',
        '读取 obj.name 时，引擎先查对象自身属性，找不到再沿 [[Prototype]] 链向上查找；Object.keys 只列自有可枚举字符串属性，for...in 还会遍历继承的可枚举属性。Object.hasOwn(obj, "name") 才能精确回答是否自有。失败边界是把继承值当成数据库字段，序列化时又被 JSON.stringify 忽略；验证动作是对同一属性分别运行 Object.hasOwn、in 和 Object.keys，记录三个答案。',
        '先问属性属于谁',
      ],
      [
        '数据描述符控制读写',
        'Object.defineProperty 可以设置 value、writable、enumerable 和 configurable；writable 为 false 时赋值不能覆盖，configurable 为 false 后不能删除或把属性改成访问器。普通对象字面量的字段默认三者都可写、可枚举、可配置。失败边界是创建安全配置后仍被下游赋值，而代码没有决定是抛错还是接受静默失败；验证动作是在严格模式模块中重复赋值，捕获错误并检查 descriptor 未变化。',
        '描述符是属性规则',
      ],
      [
        '访问器把计算藏在读取里',
        'get 与 set 是访问器函数的语法，get elapsed() 可以在每次读取时计算，但如果在 getter 内做网络请求或修改无关状态，属性读取会产生副作用。set 也不应静默吞掉非法值。失败边界是把 getter 当普通字段反复读取昂贵计算；验证动作是用 Object.getOwnPropertyDescriptor(instance, "elapsed") 确认存在 get，记录多次读取是否返回不同值，并评估缓存策略。',
        '读取可以计算但不应偷袭',
      ],
      [
        '原型链是共享方法的路径',
        'Object.create(proto) 创建的新对象以 proto 作为 [[Prototype]]；方法放在原型上可被所有实例共享，数据状态仍应放在各自对象。Object.create(null) 生成没有 Object.prototype 的字典对象，适合避免 hasOwnProperty 等名称冲突。失败边界是对无原型对象调用 obj.hasOwnProperty 后报错；验证动作是打印 Object.getPrototypeOf(obj)，改用 Object.hasOwn.call 或 Reflect 方法完成判断。字典键应用方括号访问，避免把用户可控字段误当成对象内建方法调用。',
        '共享方法不共享实例数据',
      ],
      [
        '对象模型可检查也可复现',
        'Object.getOwnPropertyDescriptors、Object.getPrototypeOf 和 Reflect.ownKeys 能展开对象结构；重构前保存这些结果，重构后用测试确认可枚举字段、访问器与原型关系符合预期。失败边界是只看 DevTools 折叠摘要，把非枚举字段误认为丢失；验证动作是写快照测试，比较键集合、descriptor 类型和原型是否为 null，再故意创建实例确认状态隔离。',
        '对象关系要能被观测',
      ],
    ],
  },
  {
    name: jsName(j2Stage, '构造函数、class 与实例方法'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '已掌握对象字面量、函数调用和 new 的基本写法，能查看原型对象。',
    goal: '理解 new 的绑定与返回规则，使用 class 字段、构造器和原型方法建立对象不变量，区分实例状态与共享方法。',
    guidedPractice: '先写 function Point(x, y) { this.x = x; this.y = y; }，再写 class Point，比较 Point.prototype.toString 与实例自身键；故意省略 new 调用构造器，观察严格模式下 this 的情况，并打印实例的原型链。',
    independentPractice: '实现一个 class Order，构造时校验 items 为非空数组并复制输入，提供 addItem 与 total 方法；用测试验证两个订单互不影响，修改传入数组不会污染内部状态，缺少参数时抛出明确的 TypeError。',
    commonErrors: [
      '在实例方法里用普通函数注册回调，回调执行时 this 不再指向实例。',
      '构造器接受数组后直接保存引用，外部后续 push 会绕过订单校验并改变内部状态。',
    ],
    sourceRefs: [
      'ECMAScript Class Definitions. https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html#sec-class-definitions',
      'MDN Classes. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes',
      'MDN new operator. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new',
    ],
    steps: [
      [
        'new 创建并绑定实例',
        'new Ctor(...args) 会创建新对象，把它的 [[Prototype]] 设为 Ctor.prototype，以该对象作为 this 执行构造器，再根据返回值决定是否使用返回对象。class 构造器必须用 new 调用，普通函数若不 new，在严格模式中 this 为 undefined。失败边界是构造器误返回原始值，调用方却以为拿到了实例；验证动作是检查 Object.getPrototypeOf(instance) === Ctor.prototype，并对无 new 调用断言 TypeError。构造器返回其他对象时原型可能变化，因此工厂函数应明确返回契约。',
        '构造器描述实例创建协议',
      ],
      [
        'class 语法保持严格边界',
        'class 声明内的代码始终处于严格模式，方法定义挂在 prototype 上而不是复制到每个实例；实例字段则在每个实例构造时初始化。class 不会被提升到可安全调用的位置，声明前访问会触发暂时性死区。失败边界是把工具类写成 class 后到处 new，实际上只需要无状态函数；验证动作是打印 Object.getOwnPropertyNames(Point.prototype)，确认构造器与方法位置，再比较多个实例的方法引用。',
        '方法共享，状态按实例创建',
      ],
      [
        '构造器维护不变量',
        '构造器应在写入核心字段前验证输入，并复制传入的可变数组，例如 this.items = [...items]；这样外部修改原数组不会绕过后续校验。只读业务标识可在构造后冻结属性。失败边界是校验只发生在创建时，后续 addItem 直接接受非法金额；验证动作是分别篡改传入数组、调用 addItem 添加负数、读取 total，确认每个入口都返回错误或抛出 RangeError。',
        '对象一旦创建就应满足约束',
      ],
      [
        '方法接收者由调用点决定',
        'order.addItem(item) 中方法调用会把 order 作为 this；把方法解构成 const add = order.addItem 后调用 add(item)，this 为 undefined，严格模式会抛错。需要传递方法时显式使用箭头函数、bind 或传闭包，并在接口中说明。失败边界是把实例方法直接交给事件监听器后报 Cannot read properties of undefined；验证动作是记录调用栈里的 this，并改为 () => order.addItem(item) 或 bind(order)。把接收者作为显式参数传入，还能让同一方法复用于多个订单实例。',
        '方法不是脱离接收者的自由函数',
      ],
      [
        '用测试锁定实例语义',
        '测试构造器时覆盖非法输入、两个实例独立、方法引用共享和嵌套可变数据隔离；断言 order instanceof Order 只说明原型关系，不说明不变量成立，还要检查字段与行为。失败边界是测试只断言构造函数返回对象，没有验证业务约束；验证动作是写一组 createOrder 测试，修改一个实例后检查另一个实例不变，并故意破坏校验观察测试是否失败。',
        '原型关系与业务约束分别验证',
      ],
    ],
  },
  {
    name: jsName(j2Stage, 'this、call、apply 与 bind'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能定义普通函数与方法，理解对象属性访问，并知道严格模式下独立函数调用的 this 为 undefined。',
    goal: '按调用点推断 this，区分方法调用、显式 call/apply、bind 返回的新函数，并能修复回调与借用方法时的接收者问题。',
    guidedPractice: '创建 logger 对象和 log(message) 方法，依次执行 logger.log("a")、log.call(logger, "b")、log.apply(logger, ["c"])、const bound = log.bind(logger); bound("d")；每一步打印 this === logger 的结果。',
    independentPractice: '实现带前缀的 formatRecord 方法，并把它借给另一个对象处理批量记录；用 call、apply、bind 各完成一次调用，补测试证明 bind 不改变原函数、重复 bind 失败、回调触发时 this 仍指向目标对象。',
    commonErrors: [
      '把 obj.method 赋给变量后调用，仍以为 this 会自动保留原来的 obj。',
      '把 bind 当成立即执行，忽略它返回的是绑定后的新函数，原函数没有被修改。',
    ],
    sourceRefs: [
      'ECMAScript Function.prototype.call. https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-function.prototype.call',
      'MDN this. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this',
      'MDN Function.prototype.bind. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind',
    ],
    steps: [
      [
        '调用点决定普通函数 this',
        'obj.fn() 以 obj 为接收者，fn() 在严格模式中以 undefined 为 this；箭头函数不创建自己的 this，而是从外层词法环境读取。构造函数调用、call/apply 又与普通调用不同。失败边界是把对象方法作为回调传入 setTimeout 后丢失接收者；验证动作是在函数内记录 this 与调用栈，分别用直接方法、解构方法、箭头包装三种方式比较。',
        '先看函数怎样被调用',
      ],
      [
        'call 与 apply 显式传接收者',
        'fn.call(receiver, a, b) 按位置传参，fn.apply(receiver, [a, b]) 按数组传参，二者都立即执行并返回函数结果。它们适合借用方法或一次性指定接收者，不会修改原函数。失败边界是把 null 传给严格函数后仍尝试 this.name；验证动作是对同一函数分别调用 call 与 apply，断言结果相同，并检查原函数的 this 绑定没有被永久改变。',
        '显式调用只影响这一次',
      ],
      [
        'bind 返回新的绑定函数',
        'const bound = fn.bind(receiver, prefix) 返回一个新函数，调用 bound 时 receiver 无法被普通 call 覆盖；bind 还允许预设参数，但箭头函数没有可绑定的 this。重复 bind 不会叠加新的 this。失败边界是执行 fn.bind(obj) 后继续调用 fn，原函数自然还是旧行为；验证动作是比较 fn === bound 为 false，调用 bound.call(other) 仍使用 obj，并保存两个函数引用用于测试。若要同时固定接收者和部分参数，应把 bind 返回值命名成新的业务入口。',
        '绑定函数是新函数对象',
      ],
      [
        '回调要携带正确接收者',
        '把 this.format(item) 传给 map 时，应写成 items.map((item) => this.format(item)) 或 items.map(this.format.bind(this))；事件监听器同样需要包装，并在卸载时保存同一个函数引用。失败边界是类字段中的普通方法被解构后执行，this 变成 undefined；验证动作是先在构造器里创建 boundHandler，再调用 addEventListener 与 removeEventListener，确认事件触发和卸载都有效。若监听器只在局部创建，清理函数必须闭包保存它，否则无法再次取回。',
        '传递方法时同时传递接收者',
      ],
      [
        '严格模式让绑定错误可见',
        '独立函数调用在严格模式 this 为 undefined，非严格模式可能被替换成 globalThis；测试应显式断言预期接收者，而不是只看是否崩溃。为需要热重载或响应式代理的对象保存绑定时，要确认绑定对象不会变成过期快照。失败边界是替换对象后仍调用旧 bind 的函数；验证动作是创建两个实例，分别绑定并触发回调，确认每个回调读取各自字段而没有串用。',
        '错误早暴露比隐式修复好',
      ],
    ],
  },
  {
    name: jsName(j2Stage, '箭头函数与回调上下文'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解普通函数的 this、参数和返回值，能在对象方法与数组回调中追踪调用点。',
    goal: '正确判断箭头函数的词法 this、arguments 与不可构造特性，在数组回调、事件包装和类字段中选择合适函数形态。',
    guidedPractice: '在对象的普通方法中分别创建 function 回调与箭头回调，打印 this 和 arguments；尝试对箭头函数 new，再比较箭头函数没有 prototype 的事实。把同一个回调传给数组 map，观察箭头函数读取外层的 this。',
    independentPractice: '重构一个事件处理器：普通方法注册多个按钮回调时丢失 this，改用箭头函数包装或构造函数中 bind；为每个按钮保存引用并实现卸载，测试点击后读取当前实例状态而不是旧闭包快照。',
    commonErrors: [
      '把箭头函数当成普通函数的简写，使用 new 构造或依赖 arguments 后得到错误结果。',
      '在对象字面量方法上使用箭头函数，导致 this 永远不是该对象，而是模块或外层作用域。',
    ],
    sourceRefs: [
      'MDN Arrow function expressions. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions',
      'ECMAScript Arrow Function Definitions. https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html#sec-arrow-function-definitions',
      'MDN Array.prototype.map. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
    ],
    steps: [
      [
        '箭头函数的 this 来自外层',
        'const handler = () => this.count 中的 this 在创建函数时按外层词法环境解析，之后 call、apply、bind 都无法改变它；普通函数的 this 在调用时确定。这使得箭头函数适合短回调，不适合需要动态接收者的方法。失败边界是在对象方法中使用箭头函数后 this.count 读取模块顶层；验证动作是打印 this === expectedObject，并对比同一位置普通 function 的结果。',
        '箭头绑定看定义位置',
      ],
      [
        '没有独立 arguments 与 prototype',
        '箭头函数没有自己的 arguments 对象，读取的是外层函数的 arguments；也没有 prototype，不能用 new 调用。需要不定参数时应使用 rest 参数 (...items)。失败边界是把旧函数的 arguments 风格直接改成箭头函数后参数数量异常；验证动作是对箭头函数调用 new 并捕获 TypeError，再用 function 版本打印 arguments.length 进行对照。若回调需要多个参数，直接写形参列表比模拟 arguments 更清楚且可检查。',
        '语法短不等于行为相同',
      ],
      [
        '数组回调适合表达式箭头',
        'items.map((item) => item.price * item.quantity) 能清楚表达单个返回值，复杂逻辑应改成具名函数或块体以避免嵌套过深。forEach 返回值是 undefined，不能用它顺手 collection 结果。失败边界是箭头函数返回对象字面量却没加括号，实际返回 undefined；验证动作是检查 map 结果类型、写出对象返回括号，并对空数组断言返回空数组而非 undefined。',
        '短回调保持表达式单纯',
      ],
      [
        '类字段与事件回调的生命周期',
        'class Counter { onClick = () => this.count += 1 } 为每个实例创建绑定函数，适合直接传入 addEventListener，但会占更多实例内存；构造函数内 this.onClick = this.onClick.bind(this) 可共享原型方法。无论哪种方式，removeEventListener 必须拿到同一个函数引用。失败边界是每次渲染新建箭头函数却不删除旧监听器；验证动作是保存 handler 引用，挂载和卸载后检查监听器数量与实例计数。',
        '可移除比写法优雅更重要',
      ],
      [
        '接收者测试要覆盖动态调用',
        '对箭头回调测试 call、apply、bind 后仍读取外层值，对普通方法测试解构后报错或得到 undefined；再验证回调在异步队列执行后读取的是实例当前状态。失败边界是只测同步点击，忽略事件循环后的状态变化；验证动作是更新实例字段后再手动触发 handler，断言读取新值，并检查事件对象参数没有被错误覆盖。',
        '把动态调用场景放进测试',
      ],
    ],
  },
  {
    name: jsName(j2Stage, '组合、委托与继承取舍'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已掌握对象原型、class、方法调用和闭包，能阅读多层类声明并识别共享行为。',
    goal: '区分原型继承、对象委托与方法组合，按变化方向控制耦合，能把不必要的深层继承重构为职责清晰的对象组合。',
    guidedPractice: '构造一个三层继承链 Animal → Bird → Penguin，给每层加方法并查找实际执行位置；再改写成 createBird({ canFly })，用组合对象提供 walk、fly 与 speak，比较调用点、原型链和替换依赖的难易程度。',
    independentPractice: '为订单通知系统实现组合方案：EmailChannel、SmsChannel 各自提供 send，NotificationService 通过注入 channels 调用；用测试替换一个 fake channel，验证新增渠道无需修改服务逻辑，并记录继承方案会迫使其覆写哪些方法。',
    commonErrors: [
      '为复用几个方法建立多层 class 继承，结果子类被迫继承不适用的行为和状态。',
      '把组合理解成把函数挂在全局，没有定义清晰的依赖接口和失败处理。',
    ],
    sourceRefs: [
      'MDN Inheritance and the prototype chain. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain',
      'MDN Object.create. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create',
      'ECMAScript Class Inheritance. https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html#sec-runtime-semantics-classdefinitionevaluation',
    ],
    steps: [
      [
        '继承表达的是 is-a 关系',
        'class Penguin extends Bird 会让 Penguin.prototype 继承 Bird.prototype，super 调用父构造器与方法；只有子类型确实满足父类型契约时才适合继承。父类新增方法可能无意中进入所有子类型。失败边界是为了复用 move 把一个能跑的动物继承成不能跑的企鹅；验证动作是列出父类公开方法并逐一检查子类是否都能履行，再在测试中替换父类接口观察是否破约。',
        '先问是否真的是一种',
      ],
      [
        '委托复用行为但保持对象独立',
        'const reader = Object.create(baseReader) 让 reader 查找 baseReader 上的方法，同时可在自身覆盖字段；委托链要浅，随时能解释查找路径。适合共享无状态策略，不适合让多个对象偷偷共享可变 count。失败边界是基对象状态被所有委托者修改；验证动作是打印两个委托对象的原型与自有键，修改其中一个的可变字段后确认另一个不受影响，否则改为工厂实例。',
        '委托链要短且状态要独立',
      ],
      [
        '组合用依赖接口拼能力',
        'function createNotifier(channels) { return { async send(message) { await Promise.all(channels.map((channel) => channel.send(message))); } }; } 中服务只依赖 send 契约，具体渠道可替换。参数通过构造器注入，避免在函数内部直接 new 全局对象。失败边界是一个渠道失败导致所有结果被丢弃却没有报告；验证动作是注入成功和失败两个 fake channel，断言全成功、部分失败与全失败三种结果。渠道返回统一结果对象，可以让调用方区分投递成功、部分失败与全部失败。',
        '组合把变化留在边界',
      ],
      [
        '选择改变点最少的方案',
        '若变化集中在新增渠道、存储或渲染器，组合比多层继承更合适；若对象确实共享完整状态机和模板步骤，class 与 super 可能更直接。记录选择理由与替代方案，避免为了统一风格把一切改成 class 或反过来。失败边界是抽象方向跟实际变化相反，每次新增能力都要改父类；验证动作是做一次假设变更，统计需要触碰的文件和测试数量，再决定是否重构。',
        '设计取决于变化方向',
      ],
      [
        '重构要保留外部契约',
        '把继承改成组合时，先保存旧对象 public 方法与返回结构，迁移内部实现后由适配器保留旧调用方式，再用回归测试比较新旧行为。失败边界是重构顺手改了事件名或错误格式，调用方一起失效；验证动作是保留旧测试不改，新增组合测试通过后再逐步替换调用点，并记录每轮失败用例。',
        '内部结构可变，外部行为先固定',
      ],
    ],
  },
  {
    name: jsName(j2Stage, '对象模型调试与重构'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '能阅读原型链与 class，使用 Object 静态方法，并会在 DevTools 中查看对象作用域。',
    goal: '用自有属性、原型关系、descriptor 与对象图定位状态共享和 this 丢失问题，并用测试保护对象模型重构。',
    guidedPractice: '在 DevTools 中对一个多层对象执行 Object.getOwnPropertyDescriptors、Object.getPrototypeOf 与 Reflect.ownKeys，展开 Map 值的来源；制造两个实例共享同一数组的缺陷，设置条件断点跟踪写入者。',
    independentPractice: '重构一个使用多层原型和全局 this 的旧模块，拆成工厂函数、显式依赖和不可变配置；保留旧入口适配，增加实例隔离、回调接收者和清理行为测试，并记录重构前后的对象图差异。',
    commonErrors: [
      '只浏览 DevTools 的折叠对象摘要，把原型上的方法或不可枚举字段当成不存在。',
      '重构时同时改对象结构、事件名和错误格式，失败后无法判断是哪类变化导致回归。',
    ],
    sourceRefs: [
      'Chrome DevTools inspect objects. https://developer.chrome.com/docs/devtools/console/utilities/',
      'MDN Object.hasOwn. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn',
      'MDN Reflect.ownKeys. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/ownKeys',
    ],
    steps: [
      [
        '先建立对象结构快照',
        '对一个对象记录自有键、原型引用、descriptor 和数组长度，能区分“字段不存在”“存在但不可枚举”和“从原型读取”。使用 Reflect.ownKeys 可看到 Symbol 键，Object.hasOwn 判断归属。失败边界是只打印 JSON.stringify 后误以为对象模型完整；验证动作是将快照写入调试记录，再在对象修改后重复采集，逐项比较键集合与原型是否变化。',
        '先看结构再看值',
      ],
      [
        '追踪共享引用的写入者',
        '当两个实例的数组同步变化时，用 Object.is(instanceA.items, instanceB.items) 检查引用是否相同，再在 push 或赋值行设置条件断点，查看 Call Stack 中的写入来源。共享不一定错误，但没有所有权的共享会造成隐蔽耦合。失败边界是仅通过复制结果掩盖共享，没有处理创建来源；验证动作是在构造器后复制输入并再次断言引用不同，随后检查修改副本不会影响原数组。',
        '共享引用要追到创建点',
      ],
      [
        'this 错误沿调用链定位',
        '调用栈中方法报 undefined 属性的位置通常不是根因，往上一层查看函数是怎样被传入的；若是 obj.method 被解构为回调，this 已丢失。修复用箭头包装、bind 或把依赖显式传参。失败边界是给整个类方法都加 bind 却没处理卸载引用；验证动作是记录手动手点、事件触发、卸载后再触发三种栈，确认同一 handler 既能被移除又保留正确接收者。',
        '接收者问题常在调用点出现',
      ],
      [
        '重构先保留可观察契约',
        '把 class 改工厂时保留方法名、参数、返回对象和错误类型，先在外层增加适配器；再迁移内部状态和组合关系。每完成一个小步就运行原有行为测试。失败边界是旧调用方依赖某个原型方法，重构后 Object.getPrototypeOf 关系改变导致方法丢失；验证动作是对比旧新对象暴露的 key 集合与调用结果，并给旧兼容层专门测试。',
        '行为兼容优先于原型相同',
      ],
      [
        '对象图测试保护变化',
        '测试可断言实例之间字段不共享、方法引用可按需要共享、原型关系符合选择、私有状态不被反射 API 意外修改；对依赖接收者的回调单独测试。失败边界是测试只在同一实例连续调用，无法发现跨实例污染；验证动作是创建两个实例交错执行，再清理所有定时器和监听器并用堆快照确认没有悬挂引用。',
        '跨实例测试暴露对象耦合',
      ],
    ],
  },
];

// ── J3 事件循环、Promise 与异步控制 ─────────────────────────────────────────
const j3Stage = '事件循环、Promise 与异步控制';

const JAVASCRIPT_J3_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: jsName(j3Stage, '调用栈、任务队列与微任务'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '会写普通函数与 setTimeout，知道回调会在未来某个时刻执行，并能阅读控制台输出顺序。',
    goal: '解释同步调用栈、宏任务与微任务队列的执行顺序，预测 Promise.then、setTimeout 和渲染机会的先后关系。',
    guidedPractice: '运行一段同时包含 console.log("sync")、queueMicrotask(() => console.log("micro"))、setTimeout(() => console.log("timer"), 0) 与 Promise.resolve().then(...) 的脚本，先写预测顺序，再用浏览器 Performance 与断点核对实际执行顺序。',
    independentPractice: '为一段包含同步计算、Promise 回调、setTimeout 与 requestAnimationFrame 的页面绘制时间线，标出调用栈清空、微任务排空、渲染与下一任务的位置，并用日志验证自己的预测。',
    commonErrors: [
      '把 setTimeout(fn, 0) 当成立即执行，忽略它要等当前任务和微任务队列清空。',
      '认为每个 Promise.then 都会在独立宏任务中运行，实际上微任务会优先排到当前任务末尾。',
    ],
    sourceRefs: [
      'HTML Standard event loops. https://html.spec.whatwg.org/multipage/webappapis.html#event-loops',
      'MDN Event loop. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop',
      'MDN Using microtasks. https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide',
    ],
    steps: [
      [
        '同步调用栈先完成',
        '函数调用会压入调用栈，同步代码必须返回到栈空才轮到其他队列；长循环会让调用栈长时间不释放。console.log 的执行位置就是它真正进入栈的时刻，不是代码行的视觉位置。失败边界是把异步回调写在前面就以为它会先执行；验证动作是给每条日志加序号与 performance.now()，确认同步段全部闭合并返回后才出现异步段。',
        '栈空之前不会切换任务',
      ],
      [
        '微任务在当前任务末尾排空',
        'Promise.then、queueMicrotask 与 MutationObserver 回调属于微任务；当前宏任务的主体和栈清空后，事件循环会持续执行微任务队列，直到为空才继续下一轮，期间还可能加入新的微任务。失败边界是微任务无限递归创建 Promise.then，导致浏览器无法渲染；验证动作是记录微任务数量与执行顺序，加入上限计数并在超限时终止实验。',
        '微任务可能持续追加',
      ],
      [
        '定时器是新的任务机会',
        'setTimeout 注册回调并至少等待指定毫秒，实际执行取决于任务队列和页面状态；0 毫秒也不代表插队。多个 timer 的顺序不保证跨浏览器完全稳定，不能拿来承载业务因果。失败边界是依赖 0ms timer 修复竞态；验证动作是同时注册两个 timer 与 Promise，记录事件时间戳，并确认业务顺序应通过显式 Promise 链或状态机表达。',
        '时间为零仍需等待排队',
      ],
      [
        '渲染机会在任务之间',
        '浏览器通常在一轮任务和微任务处理完、需要更新画面时执行 style、layout、paint；requestAnimationFrame 回调属于渲染更新阶段，不是普通微任务。DOM 写入后要等下一帧才能稳定读取布局结果。失败边界是把 getBoundingClientRect 的结果当成异步完成后的旧值；验证动作是在修改样式后分别于 Promise 与 requestAnimationFrame 中读取尺寸，记录哪个阶段得到新布局。',
        '布局与任务不是同一时刻',
      ],
      [
        '实验必须能解释时间线',
        '将每条日志绑定 event、task、microtask、raf 标签，记录开始、结束和耗时；对同一脚本重复运行，确认顺序稳定部分与波动部分。失败边界是只贴一段输出，没有说明运行环境；验证动作是把脚本放入浏览器控制台和 Node 分别执行，比较无渲染环境下 raf 缺失的情况，并保存预期顺序测试。',
        '先分清稳定规则与环境差异',
      ],
    ],
  },
  {
    name: jsName(j3Stage, 'Promise 状态、链式错误与聚合'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '会创建 Promise，使用 then/catch，并理解异步任务会在当前调用栈之后执行。',
    goal: '掌握 Promise 的 pending、fulfilled、rejected 状态与链式传播，正确使用 catch、finally、all、allSettled 和 race 处理成功与部分失败。',
    guidedPractice: '构造 resolved 与 rejected Promise，用 then 返回值生成新 Promise 链，观察 throw 如何进入 catch 与 finally；分别执行 Promise.all 与 Promise.allSettled，记录失败时是否丢弃其他结果。',
    independentPractice: '实现 loadAll(urls)：默认要求全部成功返回数据，增加 allowPartial 选项时使用 allSettled 收集成功项与错误项；为超时、HTTP 失败和一个成功一个失败写测试，确保返回结构稳定。',
    commonErrors: [
      '在 then 中忘记 return 内部 Promise，导致外层无法等待内层完成。',
      '使用 Promise.all 后只处理 catch，没有保留已成功请求的结果，也不清楚其他请求是否仍会继续。',
    ],
    sourceRefs: [
      'MDN Promise. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
      'MDN Promise.all. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all',
      'MDN Promise.allSettled. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled',
    ],
    steps: [
      [
        '状态只能转换一次',
        'Promise 初始为 pending，resolve 后 fulfilled，reject 后 rejected；后续再次调用 resolve 或 reject 不会改变状态。then 返回一个新的 Promise，因此链式调用中的返回值会成为下游输入。失败边界是把异步结果写进外部变量后忘了返回链；验证动作是给每一步附加标记，检查下游是否在上游完成后收到值，并测试重复 resolve 不改变结果。',
        'Promise 是一次性状态机',
      ],
      [
        '链式错误会向下传播',
        'then(onFulfilled, onRejected) 只处理当前 Promise 的拒绝，而 catch 捕获链上之前步骤的错误；finally 无论成功失败都执行但不改变原值。throw 一个 Error 会变成 rejected Promise。失败边界是把 catch 放在错误步骤前面，后续步骤仍可能抛出未处理拒绝；验证动作是在链中间抛出带 code 的错误，记录 catch 收到的错误类型和 stack，并确认 finally 之后仍能继续另一个链。',
        '错误沿链向后传递',
      ],
      [
        '聚合要明确失败策略',
        'Promise.all 在任一输入 rejected 时立即 rejected，其他任务通常仍继续执行；Promise.allSettled 总是 fulfilled，并为每项返回 status 与 value 或 reason。UI 若允许部分成功，必须显式选择 allSettled 并给失败项展示重试入口。失败边界是把 all 的超时错误当成所有数据都失败；验证动作是使用 fake 请求返回一成功一失败，分别检查 all 与 allSettled 的结果结构和耗时。',
        '先决定部分失败如何处理',
      ],
      [
        'race 与 any 的选择',
        'Promise.race 返回第一个 settled 的结果，不论成功失败；Promise.any 等待第一个 fulfilled，全部失败才以 AggregateError 拒绝。超时通常用 AbortController 或 Promise.race 配合清理，不能只靠 race 留下后台请求。失败边界是把 race 当超时并认为慢请求已取消；验证动作是记录慢请求是否仍在 Network，再在超时后主动 abort 并检查 signal.aborted。在 finally 中取消超时 timer，能避免成功路径仍残留计划任务。',
        '竞速结果不等于取消副作用',
      ],
      [
        '返回结构要稳定',
        'loadAll 可返回 { ok: true, data } 或 { ok: false, succeeded, failed }，错误项带 index、url 与 reason；调用方不需要根据抛错位置猜部分状态。失败边界是成功路径返回数组、失败路径返回对象，界面分支无法统一；验证动作是用 Vitest 参数化正常、全失败、部分失败三组输入，断言每个字段的类型、顺序和不可变性。错误报告中的 succeeded 项应保持输入顺序，failed 项不能丢失原始 index。',
        '异步接口也需要明确结果类型',
      ],
    ],
  },
  {
    name: jsName(j3Stage, 'async/await、顺序与并发'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会使用 Promise.then/catch，理解 Promise 链的返回值与 finally，并能写 async 函数。',
    goal: '用 async/await 表达线性依赖，区分串行等待与并发聚合，正确处理拒绝、部分失败和返回值。',
    guidedPractice: '对两个互不依赖的 fetch 请求分别写串行 await 与 Promise.all 并发版本，用 performance.now() 对比耗时；把其中一个请求改为失败，观察 try/catch 能捕获什么、取消后还能否继续。',
    independentPractice: '把一个逐个等待的配置加载流程改为并发加载，并在失败时返回包含成功项和失败项的报告；补充测试证明请求确实并发、失败不会阻塞其他项、返回值不会被误当作 Promise。',
    commonErrors: [
      '在循环里对每个独立请求逐个 await，导致总时间等于所有请求耗时相加。',
      '在 async 函数里 return promise.then(...) 与 return await ... 混用，错误栈和清理时机不清楚。',
    ],
    sourceRefs: [
      'MDN async function. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function',
      'MDN await. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await',
      'MDN Promise.all. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all',
    ],
    steps: [
      [
        'async 函数总是返回 Promise',
        'async function load() 返回的值会被 Promise 包装，抛出的异常会变成 rejected Promise；调用处必须 await 或链式处理。return await 与直接 return Promise 在是否保留当前 try/catch 范围内有差异。失败边界是把 async 函数忘记 await 后检查结果，拿到的是 Promise 而不是数据；验证动作是打印返回值构造器与 instanceof Promise，再在 try/catch 中分别测试同步 throw 和异步 reject。把阻塞操作放进被等待的函数内部，仍会占住执行它的线程，而不是自动后台化。',
        'async 改变返回协议',
      ],
      [
        '独立任务用并发聚合',
        'const [profile, orders] = await Promise.all([getProfile(), getOrders()]) 会在两个请求都启动后等待全部完成；在循环里逐个 await 则下一请求要等上一请求结束。并发前先确认任务无依赖且下游能承受连接压力。失败边界是把有依赖的第二步也提前启动，第二步读取到旧 ID；验证动作是记录每个请求的开始时间，确认无依赖请求重叠，并为失败请求断言整体结果策略。',
        '并发只给互不依赖的任务',
      ],
      [
        'try/catch 只包围必要范围',
        '把网络请求、解析、持久化分别放在有名字的小函数中，try 只包住会抛出同步或异步错误的步骤；catch 记录 cause 并返回稳定错误对象。不要把整个页面初始化塞进一个巨大 try，否则无法知道失败阶段。失败边界是 catch 中吞掉错误后返回空数组，使监控看不到真实故障；验证动作是注入解析错误和网络错误，确认日志中的阶段码不同，调用方收到不同的可展示消息。',
        '错误要带上下文穿过边界',
      ],
      [
        '局部失败需要显式分支',
        '允许部分成功时使用 Promise.allSettled 或逐项 catch 并把 failed 项记录为 { index, error }；全成功和部分成功应返回同一形状，避免调用方临时判断嵌套类型。失败边界是一个请求失败导致整个 Promise.all 拒绝，却仍把已完成数据写进 UI 而不标记不完整；验证动作是构造 2 成功 1 失败，断言失败计数、成功顺序和用户可见提示都符合报告。',
        '部分成功也是正式结果',
      ],
      [
        '取消与清理沿调用链传播',
        '长任务接受外部 AbortSignal，在每次 await 之后检查 signal.aborted，catch 区分 AbortError 与真实故障；组件卸载或请求被替代时调用 abort，并清理本地 timeout 与临时缓存。失败边界是请求已取消但写回旧页面 DOM；验证动作是快速切换查询条件，确认旧请求在 Network 显示 canceled，页面只渲染最后一个有效响应，且没有未处理拒绝。',
        '取消要从入口传到副作用',
      ],
    ],
  },
  {
    name: jsName(j3Stage, 'AbortController、超时与取消'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '会使用 fetch 和 Promise.catch，知道成功响应、HTTP 错误与网络异常不是同一种情况。',
    goal: '使用 AbortController 主动取消 fetch 和可中止任务，组合超时、用户取消和组件卸载，确保取消后不提交过期结果。',
    guidedPractice: '创建 controller，执行 fetch(url, { signal: controller.signal })，在响应未完成时调用 controller.abort()；分别捕获 AbortError、HTTP 500 与网络失败，打印 error.name、error.message 与 signal.aborted。',
    independentPractice: '为搜索框实现取消旧请求：每次输入创建新 controller，取消上一个请求，输入停止后发送；给 API 加 AbortSignal.timeout(3000) 或手动 timeout，验证慢请求、用户离开和正常响应三条路径。',
    commonErrors: [
      '认为 fetch 收到 HTTP 500 会自动 reject，忘记检查 response.ok 并抛错。',
      '超时后只忽略 Promise 结果，没有 abort 底层请求，后台连接继续占用资源并可能写回旧状态。',
    ],
    sourceRefs: [
      'MDN AbortController. https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
      'MDN AbortSignal. https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal',
      'MDN Fetch API. https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
    ],
    steps: [
      [
        'signal 连接发起与取消',
        'const controller = new AbortController(); fetch(url, { signal: controller.signal }) 让请求订阅取消信号；controller.abort(reason) 会把 signal.aborted 设为 true，并让进行中的 fetch 以 AbortError 拒绝。一个 controller 可以服务多个请求，但取消后不能复用。失败边界是取消后再次用同一 signal 发起请求，马上得到拒绝；验证动作是分别在 abort 前后检查 signal.aborted 和请求状态。取消原因可通过 abort(reason) 传入，日志应记录 reason 而不是只记 AbortError。取消完成后再触发一次业务回调，确认没有重复写入。',
        '取消信号是单向的',
      ],
      [
        'HTTP 错误要手动判定',
        'fetch 只在网络层失败时拒绝，HTTP 404 或 500 仍会 fulfilled；应检查 response.ok，并根据 response.status、content-type 和错误 JSON 决定抛错。读取 body 失败也可能发生在 response.json()。失败边界是把 500 的 JSON 当成成功数据渲染；验证动作是对 200、404、500 和无效 JSON 写四个 fake 响应，断言每类错误有不同 code。对于可重试状态应读取 Retry-After，并让重试共享同一总截止时间。不要把解析错误也归入网络重试，应先修复协议或服务端响应。',
        '响应状态与解析结果分别验证',
      ],
      [
        '组合超时与外部取消',
        '可以使用 AbortSignal.timeout(3000) 取得自动超时信号，再通过 AbortSignal.any([userSignal, timeoutSignal, unmountSignal]) 组合多个原因；不支持组合 API 的环境需手动建 controller 并监听各信号。失败边界是超时后未清除自己的 timer 或监听器；验证动作是分别触发用户取消、超时和正常完成，确认只出现一个错误原因，且清理后 signal 不再持有回调。若组合信号已经取消，立即停止后续请求，避免继续分配连接与临时对象。',
        '多个取消原因要能区分',
      ],
      [
        '取消后的数据不能写回',
        '请求取消后，catch 只处理 AbortError 并直接返回；业务代码在写入缓存、更新 DOM 或提交表单前再次检查 signal.aborted 与当前请求序号。事件处理器卸载时应 abort 全部在途请求。失败边界是旧请求晚于新请求成功，覆盖最新 UI；验证动作是用人为延迟让旧请求最后返回，检查最终页面只保留新请求数据。',
        '取消必须阻止结果落地',
      ],
      [
        '取消行为进入测试矩阵',
        '为每个异步资源定义完成、失败、取消、超时四种结局，测试环境使用可控 Promise 和 fake timers，断言返回错误类型、清理函数调用次数和 UI 状态。失败边界是测试只覆盖成功路径，生产才暴露 AbortError；验证动作是连续执行 20 次快速切换，检查未处理 rejection、监听器数量与最终显示项都稳定。',
        '把取消当成一等场景',
      ],
    ],
  },
  {
    name: jsName(j3Stage, '事件循环阻塞与任务切片'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解调用栈、微任务和浏览器渲染机会，能用 performance.now 或 DevTools Performance 观察长任务。',
    goal: '识别 CPU 密集循环造成的主线程阻塞，使用任务切片、增量处理和 Worker 降低交互延迟，并验证切片没有破坏结果。',
    guidedPractice: '对 20 万条记录写同步 filter 与 map，用 Performance 录制长任务；再把处理拆成每批 1000 条，在批次之间 await 一个 Promise 或 requestAnimationFrame，比较按钮点击响应、首屏更新与总耗时。',
    independentPractice: '把一个解析大型 JSON 并生成摘要的函数改成可取消的分批任务，要求显示进度、用户可停止、失败可重试；用长任务和结果哈希验证切片前后数据一致。',
    commonErrors: [
      '只在循环中间插入同步空转，页面仍然无法响应，因为调用栈没有释放。',
      '把所有任务都搬进 Worker，却频繁同步传大对象，主线程等待和序列化成本反而更高。',
    ],
    sourceRefs: [
      'web.dev Optimize long tasks. https://web.dev/articles/optimize-long-tasks',
      'MDN requestAnimationFrame. https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame',
      'MDN Web Workers API. https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API',
    ],
    steps: [
      [
        '长任务占住主线程',
        '同步解析、排序和大量 DOM 写入会在同一任务里持续运行，浏览器无法处理点击、输入或绘制；超过几十毫秒的片段会直接影响交互延迟。用 performance.now 记录函数开始结束，再在 DevTools Performance 查看长任务条。失败边界是只在开发机小数据上测一次；验证动作是使用接近现实的 10 万条数据，记录总耗时、最长任务和点击响应时间。',
        '先测量阻塞在哪里',
      ],
      [
        '让出调用栈再继续',
        '任务切片把数据按索引区间处理，每批结束后 await Promise.resolve() 让微任务处理，或 await requestAnimationFrame 获得渲染机会；调度器需保存 cursor 以便继续。失败边界是切片过细导致调度开销大于计算本身；验证动作是对比批大小 100、1000、10000 的总耗时与输入延迟，选择有数据支持的折中值。每批工作必须可重复执行且不依赖上一步未保存的局部变量，暂停后才能安全恢复。',
        '切片目标是让交互有机会执行',
      ],
      [
        '进度与取消要成为状态机',
        '任务状态包含 idle、running、paused、done、error，取消通过 AbortSignal 或在每批检查 token；进度只来自已处理数量，不以计时器猜测。失败边界是用户取消后旧批次仍继续 map 并覆盖新一轮状态；验证动作是快速开始、取消、再开始，检查最终只保留最后一次任务的 result 与 completed 标记。批次提交前再次检查 token，能让取消与状态写入之间不存在竞态窗口。',
        '异步任务也要明确生命周期',
      ],
      [
        'Worker 隔离重计算',
        '把纯计算放入 new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) 中，通过 postMessage 传输入与 Transferable，避免在 worker 内直接操作 DOM；结果回来后再由主线程更新界面。失败边界是传输巨型对象时主线程仍然卡顿，或 worker 抛错无人监听；验证动作是测量 postMessage 前后主线程任务长度，并注册 messageerror 与 error 处理器。Worker 内抛出异常应转成结构化消息，主线程据此终止任务并显示失败原因。',
        'Worker 隔离 CPU 不隔离数据成本',
      ],
      [
        '结果一致性与性能一起验收',
        '切片或 Worker 版本要用同一输入与同步版本比较排序结果、计数和哈希，逐项证明计算等价；再记录最长任务、首屏时间和总耗时。失败边界是只验证没有报错，却漏处理最后一批或重复一批；验证动作是对空数组、单项、整除批次和非整除批次分别断言长度与哈希，并在 Performance 面板复测交互。',
        '优化不能改变业务结果',
      ],
    ],
  },
  {
    name: jsName(j3Stage, '异步请求工程与竞态测试'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已掌握 Promise、async/await、AbortController 和基础 Fetch，能设计成功与失败返回结构。',
    goal: '组装带超时、重试、取消、并发上限和部分失败的请求流程，并用可控时钟与竞态测试证明旧结果不会覆盖新状态。',
    guidedPractice: '实现 requestJSON(url, { signal, timeout, retries })：检查 response.ok、解析 JSON、区分 4xx 与 5xx，只对限流和网络错误做有上限的指数退避；用 fake timers 和 mock fetch 记录每次尝试时间。',
    independentPractice: '为列表页实现搜索、分页和刷新并发管理：请求有 requestId、AbortSignal 与共享错误报告，限制同时请求数量；测试快速输入、旧请求晚回、超时、500 和重试耗尽。',
    commonErrors: [
      '对所有错误无条件重试，导致 400 参数错误被放大，也让日志出现大量重复副作用。',
      '用共享 currentData 判断是否过期，却没有保存请求标识，旧响应晚到时仍能覆盖新响应。',
    ],
    sourceRefs: [
      'MDN Fetch API. https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
      'MDN AbortController. https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
      'Vitest Mocking. https://vitest.dev/guide/mocking.html',
    ],
    steps: [
      [
        '请求函数返回稳定结果',
        'requestJSON 应返回 { ok, data, status, requestId } 或抛带 code、status、cause 的 Error；调用层不直接依赖原始 Response。解析前检查 content-type，空响应与 JSON 失败分别处理。失败边界是成功时返回对象、失败时返回 undefined，页面无法区分空数据和错误；验证动作是构造 204、200 JSON、500 文本、无效 JSON 四个响应，断言每个分支有明确 code。对响应正文设置最大长度，避免异常服务返回超大文本拖垮解析流程。',
        '错误结果与空数据分开',
      ],
      [
        '重试只针对可恢复错误',
        '网络抖动、429 和部分 5xx 可以重试，400、401、403 与业务校验失败不应自动重试；退避时间使用指数上限并遵守 Retry-After，必须共享总截止时间。失败边界是重试导致重复创建资源，必须为写请求加入幂等键；验证动作是从 mock 返回 429、500、400，记录尝试次数和时间间隔，确认只有前两者重试。',
        '重试是有限恢复不是无限循环',
      ],
      [
        '并发上限保护下游',
        '把任务放入队列，最多同时执行 N 个 Promise，完成一个再启动下一个；每个任务持有自己的 signal，失败按策略记录但不阻塞队列。失败边界是并发函数实现成一次性 Promise.all，实际峰值仍等于全部任务数；验证动作是用延迟可控的 mock 记录开始时间，断言任一时刻未完成请求数不超过 N。',
        '并发预算要能被测量',
      ],
      [
        '竞态用标识和取消双重防护',
        '每次查询递增 requestId，旧请求被 abort 后 catch 到 AbortError 直接返回；即使某些环境无法真正取消，响应落地前也要比较 requestId 与当前 generation。失败边界是只依靠响应顺序碰运气；验证动作是让 request 2 先返回、request 1 后返回，断言最终列表来自 request 2，并检查 request 1 的状态为 canceled。请求序号应由页面级 store 统一分配，子组件不要各自维护独立计数器。',
        '旧响应必须失去写入权',
      ],
      [
        '异步测试控制时间与顺序',
        '使用 vi.useFakeTimers 和可控 resolve/reject 的 fetch mock，逐帧推进超时与退避；断言调用次数、abort 次数、最终结果和错误报告。失败边界是测试依赖真实网络导致偶发超时；验证动作是连续运行竞态与重试用例，并在清理阶段确认所有 timers 与 signal listeners 已释放。用例结束要断言没有未处理的 Promise 拒绝，否则竞态缺陷会在测试之后才出现。',
        '可重复的时序才是测试',
      ],
    ],
  },
];

// ── J4 DOM、事件、Fetch 与浏览器状态 ────────────────────────────────────────
const j4Stage = 'DOM、事件、Fetch 与浏览器状态';

const JAVASCRIPT_J4_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: jsName(j4Stage, 'DOM 查询、创建与安全更新'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能阅读 HTML 结构，知道元素、文本节点和属性的区别，并会在浏览器控制台执行 querySelector。',
    goal: '使用 querySelector、createElement、textContent 和 DOM 片段安全构造页面，避免把不可信字符串直接当 HTML 执行。',
    guidedPractice: '对一组用户数据分别用 innerHTML 拼接、textContent 写入和 createElement 创建列表项；在名称中输入 <img src=x onerror=alert(1)>，观察三种方式的结果，并用 DevTools Elements 检查最终节点结构。',
    independentPractice: '实现 renderUsers(container, users)：清空并重建用户卡片，显示头像、名称和角色，所有用户文本走 textContent；为空数组显示空状态，为无效 URL 拒绝设置 src，并写一组含特殊字符的 DOM 测试。',
    commonErrors: [
      '把来自 API 或用户输入的名称拼进 innerHTML，浏览器会解析其中的标签和事件属性。',
      '用 outerHTML 修改文本后丢失原有事件监听器，因为节点已经被替换成新节点。',
    ],
    sourceRefs: [
      'MDN Document Object Model. https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model',
      'MDN Element.innerHTML security. https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML',
      'WHATWG DOM Standard. https://dom.spec.whatwg.org/',
    ],
    steps: [
      [
        '选择器要绑定具体根节点',
        'document.querySelector(".card") 只返回第一个匹配项，querySelectorAll 返回静态 NodeList；组件内应从传入的 root 查找，避免抓到页面其他区域。对结果判空后再操作属性。失败边界是页面结构调整后选择器命中错误组件；验证动作是给不同根节点放过相同类名，分别调用同一函数并检查更新只落在目标子树。',
        '作用域越窄选择越稳',
      ],
      [
        '创建节点并明确关系',
        'createElement("li") 只创建游离节点，append 后才进入文档；可以设置 className、dataset 与 textContent，再通过 DocumentFragment 批量插入减少重复布局。失败边界是每次循环直接插入导致多次读取布局和重绘；验证动作是在 Performance 中比较逐个 append 与 fragment 一次 append 的任务长度，并检查最终父子关系一致。批量插入完成后再统一读取布局，可避免浏览器为每个节点重复计算样式。',
        '先组装再挂载',
      ],
      [
        '文本与 HTML 走不同入口',
        'textContent 把输入作为纯文本，不解释标签；innerHTML 会解析 HTML，并可能执行事件属性或不安全 URL 带来的脚本。可信静态模板也要有固定结构，动态值单独设置。失败边界是清理函数只替换尖括号，绕过属性与编码；验证动作是输入包含标签、引号、Unicode 和 URL 的样例，断言页面上出现原文字符而不产生新节点。',
        '不可信数据只能进文本节点',
      ],
      [
        '更新属性要校验协议',
        '锚点 href 与图片 src 应通过 URL 构造与允许协议列表校验，禁止 javascript: 等可执行方案；id 与 data-* 也要限制字符集。修改 class 时使用 classList.add/remove，避免覆盖其他状态。失败边界是只检查字符串是否以 http 开头，却被大小写或空白绕过；验证动作是使用 new URL(value, location.origin) 检查 protocol，并对拒绝样例断言属性没有写入。允许的协议集合应集中定义，并在链接、图片和表单 action 上复用。',
        '属性值也是执行边界',
      ],
      [
        '渲染结果用 DOM 断言',
        '测试应查询目标节点的 textContent、属性值与数量，确认用户输入没有生成额外标签；空数据、重复渲染和销毁容器各有独立测试。失败边界是只比较 HTML 字符串，无法发现浏览器解析差异；验证动作是在 jsdom 或 Playwright 中渲染特殊字符，检查 childNodes、querySelector("img") 数量与可访问名称。还应断言 tab 顺序与可访问名称，避免视觉正确但键盘流程断裂。',
        '最终以浏览器节点为准',
      ],
    ],
  },
  {
    name: jsName(j4Stage, '事件冒泡、委托与默认行为'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '会在元素上注册 click 监听器，知道事件对象包含 target、currentTarget，并能阅读 DOM 父子结构。',
    goal: '掌握捕获、目标、冒泡顺序，使用事件委托处理动态列表，并能精确控制 preventDefault、stopPropagation 与监听器清理。',
    guidedPractice: '建立 ul > li > button 三层结构，在每层注册同一 click 监听器并打印 event.eventPhase、target、currentTarget；分别给链接和按钮调用 preventDefault，再使用 stopPropagation 阻止外层收到事件。',
    independentPractice: '实现一个动态任务列表：用 ul 上的单个 click 监听处理删除按钮，通过 closest("[data-action=delete]") 找到目标；保证点击空白区域不误删，键盘 Enter 也能触发同一动作，并验证卸载后监听器不再响应。',
    commonErrors: [
      '对每个新增按钮重复 addEventListener，却没有保存引用或统一清理，列表重绘后监听器数量持续增长。',
      '在事件处理里随意 stopPropagation，阻断分析、关闭菜单或键盘快捷键等上层逻辑。',
    ],
    sourceRefs: [
      'DOM Standard event dispatch. https://dom.spec.whatwg.org/#concept-event-dispatch',
      'MDN Event bubbling. https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling',
      'MDN EventTarget.addEventListener. https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener',
    ],
    steps: [
      [
        '事件沿路径传播',
        '事件先经过 window、document 与祖先的捕获阶段，再到达 target，随后从 target 向上冒泡；event.currentTarget 是当前监听的节点，event.target 是最初触发节点。第三个参数 capture: true 可以提前接收事件。失败边界是把 target 当成绑定监听的列表根节点；验证动作是打印每个阶段的 currentTarget，确认顺序与事件路径符合 DOM 层级。若在捕获阶段处理快捷键，应先判断目标是否位于输入控件，防止吞掉正常编辑。',
        '区分谁被点击和谁在监听',
      ],
      [
        '委托让动态列表共享监听',
        '在稳定的父容器上注册一次 click，使用 event.target.closest("[data-action]") 找到操作元素，再判断其所在行；父容器必须在操作发生后仍存在。失败边界是 closest 命中祖先另一组控件，导致错误操作；验证动作是点击嵌套图标、空白和相邻行，断言 action 与 id 均来自最近的操作节点。每条操作按钮应携带稳定标识，行内文本不能作为唯一身份依据。',
        '稳定父节点承载动态子节点',
      ],
      [
        '阻止默认行为要有目的',
        'event.preventDefault 只取消浏览器默认动作，例如链接跳转或表单提交，不会停止同一元素上的其他监听器；event.stopPropagation 阻止事件继续传播，可能影响委托与快捷键。失败边界是用 return false 解决所有问题，却忽略它只对部分属性绑定生效；验证动作是分别点击带 href 的链接和普通按钮，检查默认导航、委托动作和上层监听的实际结果。',
        '取消动作与停止传播是两件事',
      ],
      [
        '键盘与指针共享业务动作',
        '用 button 等原生可聚焦元素承载操作，click 通常可由鼠标和键盘触发；自定义 div 需要 role、tabIndex 与 keydown 处理，复杂度更高且容易出现焦点错误。失败边界是只监听 pointerdown，键盘用户无法执行；验证动作是用 Tab 聚焦后按 Enter/Space，确认删除动作与鼠标点击返回相同结果。删除等不可逆动作要有明确确认或撤销入口，键盘路径也必须得到相同保护。',
        '操作入口要覆盖输入方式',
      ],
      [
        '监听器生命周期可验证',
        '保存 handler 引用，在销毁时调用 removeEventListener，或使用 AbortController 的 signal 统一取消一组监听器；重绘时不要把同一引用重复注册。失败边界是匿名回调无法移除，容器销毁后仍捕获旧数据；验证动作是挂载、卸载、再次挂载，检查事件计数与 listener 数量，并点击旧容器确认没有回调执行。AbortController 注销后不能复用，下一次挂载应创建新的 signal。',
        '注册与移除必须成对',
      ],
    ],
  },
  {
    name: jsName(j4Stage, 'Fetch、响应、错误与流式读取'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 HTTP 方法、状态码和 JSON 基础，能使用 async/await 与 try/catch 处理 Promise。',
    goal: '正确发送 Fetch 请求，区分网络失败、HTTP 错误、JSON 解析失败和取消，使用流式响应处理大体积数据并释放资源。',
    guidedPractice: '用 fetch 请求一个 JSON 接口，打印 response.status、response.ok、content-type 与 response.headers.get("etag")；分别模拟网络断开、404 和无效 JSON，捕获 error.name、status 与解析错误，并在 DevTools Network 查看请求和响应。',
    independentPractice: '实现 fetchJSON(url, options)：设置 Accept 与 Content-Type，校验 response.ok 和 JSON 内容类型，对错误响应读取有限大小文本，支持 AbortSignal；再用 ReadableStream.getReader 统计一个文本响应的块数。',
    commonErrors: [
      '只写 fetch(url).then(r => r.json())，把 HTTP 404 当成成功数据继续渲染。',
      '流式读取后不 releaseLock 或在中途抛错留下 reader，导致后续读取和资源释放混乱。',
    ],
    sourceRefs: [
      'MDN Fetch API. https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
      'MDN Response. https://developer.mozilla.org/en-US/docs/Web/API/Response',
      'WHATWG Fetch Standard. https://fetch.spec.whatwg.org/',
    ],
    steps: [
      [
        '请求与响应都是流',
        'fetch 返回的 Promise 在收到响应头后就可以 fulfilled，响应体仍需通过 json、text 或 body.getReader 读取；body 只能消费一次，重复调用会抛 TypeError。请求体和响应体的生命周期要纳入错误处理。失败边界是在日志里先 response.json() 又把同一响应交给业务解析；验证动作是克隆响应或只选择一个消费入口，并记录读取前后的响应状态。',
        '先拿到响应头再读正文',
      ],
      [
        'HTTP 失败不是网络拒绝',
        '只有 DNS、连接中断、CORS 前置失败等情况会让 fetch reject；400、404、500 仍是 fulfilled Response，需要检查 response.ok 或 status。错误 body 可能不是 JSON，读取时要限制长度并保留状态码。失败边界是把所有错误统一成网络异常，用户无法区分重试或修改输入；验证动作是对 401、422、503 与断网分别断言 code、status 和 message。错误响应体读取也要设置大小上限，防止服务端异常返回导致二次失败。',
        '状态码必须进入业务分支',
      ],
      [
        '内容类型决定解析方式',
        '解析 JSON 前检查 content-type 包含 application/json，避免把 HTML 登录页当 JSON；response.json() 在空 body 或截断文本上会抛 SyntaxError。可以用 response.text() 读取一次后 JSON.parse，保留原文用于错误摘要。失败边界是直接信任服务端永远返回正确结构；验证动作是构造 text/html、空 body、截断 JSON 三种响应，确认每种错误有稳定提示。若接口允许空响应，应先根据状态和 content-length 判断，不要盲目解析 JSON。',
        '解析失败也是响应失败',
      ],
      [
        '流式读取要处理背压与取消',
        'const reader = response.body.getReader() 逐块读取 Uint8Array，用 TextDecoder 的 stream: true 处理跨块字符；根据业务限制累计大小或行数，并在退出时 reader.cancel 或 releaseLock。失败边界是无限追加字符串导致内存增长；验证动作是传输含中文的多块文本，断言解码结果完整，并在达到字节上限时中止读取。TextDecoder 在最后一块要传 stream: false，并释放 reader 锁。若读取过程中取消，catch 中要区分 AbortError 与解码错误。',
        '按块处理而不是整包等待',
      ],
      [
        'Fetch 测试覆盖完整矩阵',
        '用 mock 或拦截器覆盖成功 JSON、错误状态、非 JSON、网络失败、abort 和流截断，断言调用参数、header、超时与清理。失败边界是测试只 mock json() 成功，没有覆盖 response.ok；验证动作是保存每组请求 ID、状态和错误类型，并确保每个用例如实清理 signal 与 reader。覆盖超时后仍晚到的响应，确认其不会更新最终状态或缓存。',
        '把协议失败逐个测到',
      ],
    ],
  },
  {
    name: jsName(j4Stage, 'Storage、IndexedDB 与离线边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解浏览器同源策略和 JSON，知道缓存不等于持久数据库，并能使用 Promise。',
    goal: '按容量、同步性和查询需求选择 localStorage、sessionStorage 与 IndexedDB，设计版本、过期、配额和敏感数据边界。',
    guidedPractice: '在 localStorage 写入 JSON 字符串，关闭页面再打开验证仍在；用 sessionStorage 保存临时筛选，比较新标签页中的可见性；再用 indexedDB.open 建一个 stores 对象仓库，添加和读取一条记录。',
    independentPractice: '为离线列表实现一个 Repository：优先读 IndexedDB，网络成功后更新本地缓存并记录 updatedAt；增加 schemaVersion、TTL 和删除流程，测试无网络、旧版本、配额错误与损坏 JSON。',
    commonErrors: [
      '把 token、密码或完整个人信息写入 localStorage，忽略同源脚本和 XSS 都能读取。',
      '认为 localStorage 的 setItem 一定成功，没有处理配额超限、隐私模式和序列化异常。',
    ],
    sourceRefs: [
      'MDN Web Storage API. https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API',
      'MDN IndexedDB API. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API',
      'MDN Storage quotas. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria',
    ],
    steps: [
      [
        'Storage 是同步字符串表',
        'localStorage 与 sessionStorage 都按 origin 隔离，值只能保存字符串，读写同步并会占主线程；localStorage 跨会话保留，sessionStorage 通常按标签页会话保留。存取对象要 JSON.stringify 与 JSON.parse，并处理解析失败。失败边界是把复杂对象直接存入后读到 "[object Object]"；验证动作是保存、刷新、读取并断言反序列化结构，同时检查旧数据损坏时能回退默认值。',
        '小配置适合同步存储',
      ],
      [
        '配额与失败是正常路径',
        'setItem 可能在配额耗尽、存储被禁用或隐私模式受限时抛 QuotaExceededError 等错误，getItem 也可能被浏览器策略限制；写入前估算体积并捕获异常。失败边界是假设存储永远可用，在启动时未捕获错误导致整个应用白屏；验证动作是用超长字符串或 mock 抛错，确认界面降级到内存状态并提示清理。',
        '存储操作必须可失败',
      ],
      [
        'IndexedDB 以事务访问对象仓库',
        'indexedDB.open(name, version) 返回请求，onupgradeneeded 中创建 objectStore 和索引；读写通过 transaction 与 objectStore.add/put/get，事务完成后再更新 UI。失败边界是多个异步请求乱序提交，导致版本迁移只完成一半；验证动作是记录 upgrade 版本、事务 oncomplete 与 onerror，并用重复键和不存在键测试。事务作用域在事件回调返回后可能自动提交，异步读取应在事务完成前串联执行。',
        '数据库操作以事务为单位',
      ],
      [
        '版本与过期策略要显式',
        '缓存记录保存 schemaVersion、updatedAt、source 与 payload，读取时先校验版本和时间，再决定使用、刷新或删除；升级时在 onupgradeneeded 中补建索引，不依赖页面重启。失败边界是字段结构改了但版本号不变，旧数据被当新格式解析；验证动作是构造 v1 数据，再用 v2 打开，断言迁移或标记无效而不是静默崩溃。',
        '缓存也需要数据模型',
      ],
      [
        '离线能力声明边界',
        '离线列表只承诺已缓存数据可读，网络恢复后应展示同步状态与冲突；不要承诺 IndexedDB 永远不清理，重要数据需服务端保存。敏感信息不写入可被 XSS 访问的持久层。失败边界是离线时显示旧数据却不标注时间；验证动作是断开网络、清空 HTTP 缓存、重启浏览器后读取，记录哪些数据仍在以及来源时间。',
        '离线是降级能力不是备份',
      ],
    ],
  },
  {
    name: jsName(j4Stage, '表单、焦点与可访问交互'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能创建 HTML 表单和按钮，知道 label、input、button 的语义，并能读取 DOM 属性。',
    goal: '实现可键盘操作、可读屏和可恢复错误的表单，正确管理提交、焦点、约束验证和加载状态。',
    guidedPractice: '创建一个含 label、required、type=email、fieldset/legend 和提交按钮的表单，使用 FormData 读取值；先让浏览器原生验证失败，再用 checkValidity、setCustomValidity 和错误摘要触发不同状态，记录 Tab 顺序与焦点位置。',
    independentPractice: '实现一个保存设置的表单：提交期间禁用重复提交但保持错误信息可读，失败后把焦点移到错误摘要，修复字段后清除对应消息；用键盘完成全部流程，并用 Playwright 断言 role、label 与 focus。',
    commonErrors: [
      '用 div 模拟按钮并只监听 click，忽略键盘、焦点和读屏语义，导致部分用户无法提交。',
      '提交失败后只把红色文字写在表单底部，没有把焦点移到错误摘要或关联字段，用户不知道哪里出错。',
    ],
    sourceRefs: [
      'MDN Client-side form validation. https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation',
      'MDN FormData. https://developer.mozilla.org/en-US/docs/Web/API/FormData',
      'W3C WAI Forms Tutorial. https://www.w3.org/WAI/tutorials/forms/',
    ],
    steps: [
      [
        '表单语义先于脚本',
        'form、label、input、button 组合会让浏览器提供默认提交、键盘操作和可访问名称；label 的 for 要与 input 的 id 对应，错误提示通过 aria-describedby 关联。失败边界是用 placeholder 代替 label，输入后提示消失且读屏不知道用途；验证动作是用 Accessibility Tree 检查名称，并仅用键盘完成填写与提交。按钮 type 要显式声明，避免普通按钮触发表单意外提交和整页刷新。',
        '原生语义免费提供交互',
      ],
      [
        'FormData 与约束验证',
        'new FormData(form) 会按控件的 name 收集值，required、type、minLength 与 pattern 可通过 form.checkValidity() 和 control.validity 检查；提交前仍需服务端校验。失败边界是只依赖 HTML pattern 处理业务规则，客户端校验被绕过；验证动作是分别提交无效和有效数据，记录 validity 字段与服务端错误映射。读取 FormData 后应创建普通对象或领域输入，不让业务层依赖浏览器对象。',
        '浏览器校验是体验不是安全边界',
      ],
      [
        '提交状态要防重复与丢失',
        '提交处理先 preventDefault，设置 aria-busy 与禁用的提交按钮，保留表单值并等待响应；成功后根据场景重置或跳转，失败后恢复可编辑并展示错误。失败边界是禁用整个 form 导致错误摘要也无法操作；验证动作是快速双击提交，断言适配器只发出一个请求，失败后按钮恢复且焦点仍在可理解位置。',
        '忙碌状态不能破坏可恢复性',
      ],
      [
        '焦点移动要有理由',
        '错误摘要可以 role="alert" 与 tabindex="-1"，提交失败后将焦点移到摘要，摘要内链接跳到对应字段；字段错误用 aria-invalid 标记。不要在每个输入时抢焦点。失败边界是读屏只听到零散红色文本，没有关联字段；验证动作是只用 Tab、Enter 与读屏树检查错误摘要、字段名和修复后的消息清除流程。',
        '焦点引导用户解决下一步',
      ],
      [
        '端到端覆盖键盘与网络',
        'Playwright 测试用 getByLabel 和 getByRole 定位控件，覆盖空提交、非法格式、网络失败、成功和重复提交；断言 document.activeElement 与 aria-live 文本。失败边界是只使用 CSS 选择器点击，重构后测试仍过但可访问性已坏；验证动作是运行无鼠标流程并检查表单的可访问名称、错误关联与加载状态。若提交成功会跳转，还要断言目标 URL 与返回按钮，而不只检查响应状态。',
        '交互测试从用户语义出发',
      ],
    ],
  },
  {
    name: jsName(j4Stage, '浏览器数据页面实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已能操作 DOM、处理事件、调用 Fetch，并使用 localStorage 或 IndexedDB 保存数据。',
    goal: '综合实现带筛选、分页、加载、错误恢复、缓存和键盘操作的列表页，并用浏览器测试证明数据与界面状态一致。',
    guidedPractice: '使用公开只读 API 建立一个用户列表：输入框防抖筛选，分页按钮调用 Fetch，加载中显示 aria-busy，失败显示重试；把最后一次成功结果写入 IndexedDB，刷新页面后可显示更新时间。',
    independentPractice: '独立完成一个离线可读的列表页：支持 URL 查询参数、取消旧请求、空状态、错误重试、焦点恢复和存储配额失败降级；用 Playwright 覆盖键盘筛选、分页、断网和刷新恢复。',
    commonErrors: [
      '筛选输入每次按键都立即发请求，旧响应晚回后覆盖新结果，页面显示与输入不一致。',
      '只更新 DOM 数组，不把筛选与分页写入 URL，刷新或分享后无法恢复当前视图。',
    ],
    sourceRefs: [
      'MDN URLSearchParams. https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams',
      'MDN IndexedDB API. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API',
      'Playwright Locators. https://playwright.dev/docs/locators',
    ],
    steps: [
      [
        '页面状态先建模',
        '状态包含 query、page、pageSize、items、loading、error、updatedAt 与 requestId；筛选与分页从 URLSearchParams 读取，修改后通过 history.replaceState 写回地址。失败边界是 DOM 显示与内存状态各存一份且更新顺序不同；验证动作是刷新、前进后退和直接粘贴 URL，检查输入框、页码与列表来自同一状态快照。状态更新应经过单一渲染函数，禁止事件处理器各自拼接一段 HTML。',
        '可见界面必须对应一份状态',
      ],
      [
        '请求与筛选建立时序协议',
        '输入停止约 300ms 后触发请求，每次请求带递增 requestId 和 AbortController；响应返回时同时核对 id 与 signal，旧请求不得覆盖新结果。失败边界是防抖期间没有清理旧 timer，关闭页面后仍发请求；验证动作是快速输入三次，记录 Network 请求数、取消状态和最终输入对应结果。关闭页面时清除 debounce timer 与 controller，避免卸载后继续发起请求。',
        '筛选条件决定请求身份',
      ],
      [
        '加载、空与错误分离显示',
        '首屏加载显示稳定的骨架或文本并设置 aria-busy，空结果显示“没有匹配项”，错误显示状态码与重试按钮，三者不能混成同一个空白页；重试应复用当前查询参数。失败边界是请求失败后仍保留旧列表却不标注过期；验证动作是分别模拟 200 空数组、500 和断网，检查每种状态的可读标题与可操作入口。',
        '空白页无法告诉用户发生了什么',
      ],
      [
        '本地缓存标注新鲜度',
        '成功请求后写入 IndexedDB，键包含 API 路径、查询与页大小；读取缓存时校验收到的 updatedAt，离线时展示缓存并明确时间来源。失败边界是不同查询共用同一个缓存键，切换筛选后显示错数据；验证动作是保存两组查询、断网刷新并比较列表与更新时间，再执行删除缓存确认回退路径。',
        '缓存必须有作用域与时间',
      ],
      [
        '浏览器端到端验收',
        'Playwright 使用 getByRole、getByLabel 操作真实页面，覆盖键盘输入、分页、断网、重试、URL 恢复和刷新；控制台不得出现未处理错误。失败边界是只断言数据文本，没有断言行焦点与 aria 属性；验证动作是记录截图和测试 trace，检查桌面与窄屏布局、焦点顺序和最终请求 ID。还要验证浏览器后退恢复筛选与页大小，确保历史栈不会生成重复请求。',
        '用真实浏览器收口状态组合',
      ],
    ],
  },
];

// ── J5 模块、工具链与测试 ────────────────────────────────────────────────────
const j5Stage = '模块、工具链与测试';

const JAVASCRIPT_J5_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: jsName(j5Stage, 'ESM、动态导入与包解析'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '能创建多个 .js 文件并使用 import/export，知道浏览器需要 type="module" 脚本。',
    goal: '掌握静态 ESM 图、导出绑定、动态 import、import.meta 与 package.json exports 的解析规则，能诊断裸说明符和循环依赖问题。',
    guidedPractice: '建立 math.js、logger.js 与 main.js，使用 named export 和 default export；在 main.js 中静态 import 一个模块，再用 import("./feature.js") 触发按需加载，打印模块命名空间与 import.meta.url，观察 Network 的加载时机。',
    independentPractice: '把一个大模块拆成 index.js、parse.js、format.js，使用明确导出和动态加载的预览器；为浏览器和 Node 各跑一次，验证相对路径、裸包说明符、缺失扩展名与循环依赖的错误信息。',
    commonErrors: [
      '把 default export 与 named export 混用后没有核对 import 语法，运行时得到 undefined 或模块链接错误。',
      '认为 import() 会同步返回模块对象，忘记它返回 Promise，导致立即读取命名空间时报错。',
    ],
    sourceRefs: [
      'ECMAScript Modules. https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html',
      'Node.js Packages and exports. https://nodejs.org/api/packages.html',
      'MDN Dynamic import. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import',
    ],
    steps: [
      [
        '静态图在求值前建立',
        '静态 import 会先建立模块依赖图并链接导出绑定，再执行模块代码；导入的是活动绑定而非复制值，所以导出方更新计数后导入方可能观察到新值，但重新给导入绑定赋值会失败。失败边界是循环依赖在初始化前读取对方变量，拿到暂时性死区错误；验证动作是画依赖边并给模块初始化加标记，确认错误发生在哪个绑定尚未初始化。',
        '静态导入先链接后执行',
      ],
      [
        '导出形态要显式一致',
        'export const value 对应 import { value }，export default fn 对应 import fn，不能把 default 当作命名成员随便解构；import * as ns 得到只读命名空间对象。模块顶级声明默认私有。失败边界是重构时把一个 named export 改为 default，所有旧导入同时失败；验证动作是用 node --check 与浏览器模块加载各检查一次，并用测试直接导入公开入口。对外入口应集中重导出，测试和消费者从公开路径导入，避免深链内部文件。',
        '导出名也是公共契约',
      ],
      [
        '动态导入返回 Promise',
        'button.addEventListener("click", async () => { const { open } = await import("./dialog.js"); open(); }) 会把模块加载推迟到交互时，加载失败进入 catch。动态导入可用于按需功能，但不应把核心启动顺序藏在随机回调中。失败边界是模块路径错误只在点击时暴露；验证动作是模拟离线与 404，确认按钮恢复到失败状态并显示可重试提示。预加载可提前触发 import，但必须处理失败并避免把首屏关键依赖再次拆散。',
        '按需加载也要设计失败',
      ],
      [
        'import.meta 提供模块上下文',
        '浏览器 ESM 中 import.meta.url 是当前模块 URL，可配合 new URL("./asset.png", import.meta.url) 解析资源；Vite 还提供 import.meta.env，但只有 VITE_ 前缀变量会暴露给客户端。不要通过 import.meta 读取秘密。失败边界是拼接字符串时漏掉基路径，开发能加载而部署子目录后失效；验证动作是用 URL 对象比较最终 absolute URL，并在带 base 的构建预览中检查请求。构建后检查资源 URL 是否带 base，并确认 Service Worker 缓存键也使用同一路径。',
        '模块元数据不是任意配置',
      ],
      [
        '包解析从 exports 开始',
        'Node 与打包器根据 package.json 的 exports、imports、type 与条件字段解析裸说明符；exports 未声明的内部文件不能被外部导入。浏览器原生 ESM 不处理 npm 裸名称，需要 import map 或构建器。失败边界是应用直接导入包内部 src 路径，升级后被 exports 封锁；验证动作是分别运行 node import "pkg"、浏览器 Network 与 pnpm why，确认最终解析的文件来自公开入口。',
        '裸名称由宿主解析',
      ],
    ],
  },
  {
    name: jsName(j5Stage, 'pnpm、锁文件与依赖边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能编辑 package.json、安装依赖并阅读 pnpm-lock.yaml 的包版本条目。',
    goal: '使用 pnpm 工作区、精确依赖声明和锁文件建立可复现构建，识别幽灵依赖、重复版本和 peer dependency 风险。',
    guidedPractice: '执行 pnpm why lodash、pnpm list --depth 2 与 pnpm audit --prod，对比直接依赖与传递依赖；在 workspace 中给 app 添加 @scope/utils 的 workspace:* 引用，再验证 app 没有在 package.json 声明时不能直接导入。',
    independentPractice: '把两个应用共享的组件包改造成 workspace 包，补齐 package.json exports、依赖和构建脚本；删除 node_modules 后执行 pnpm install --frozen-lockfile，并测试只允许通过公开入口导入。',
    commonErrors: [
      '依赖被提升后应用能导入未声明的传递包，迁移包管理器或升级后立刻出现模块找不到。',
      '多个工作区包各自声明不兼容的 peer dependency，安装看似成功但运行期出现重复状态实例。',
    ],
    sourceRefs: [
      'pnpm Workspaces. https://pnpm.io/workspaces',
      'pnpm Lockfile. https://pnpm.io/lockfile',
      'Node.js Packages. https://nodejs.org/api/packages.html',
    ],
    steps: [
      [
        '直接依赖必须声明',
        '代码 import 的包都应出现在本包 package.json，而不能依赖工作区提升后的 node_modules 恰好可解析；pnpm 的严格 node_modules 结构会把未声明依赖暴露出来。失败边界是把开发工具遗漏到 devDependencies 之外，CI 生产安装后命令缺失；验证动作是在干净目录执行 pnpm install --prod 与构建，检查运行时所需包是否都在 dependencies。删除 node_modules 后重新安装，是发现幽灵依赖最直接的可重复检查。',
        '导入来源写进清单',
      ],
      [
        '锁文件固定解析结果',
        'pnpm-lock.yaml 记录每个包精确版本、完整性哈希与依赖关系；pnpm install --frozen-lockfile 在清单不一致时直接失败，适合 CI 和发布。失败边界是手工编辑 package.json 后忘记安装更新锁文件；验证动作是故意改版本约束再运行 frozen 安装，确认非零退出，并通过 pnpm install 生成可审查的 lock diff。锁文件差异应随依赖变更一起审查，不能由自动格式化工具悄悄覆盖。',
        '锁文件不一致就停止构建',
      ],
      [
        '工作区边界防止越界导入',
        '模块包在 exports 中只暴露 "." 与明确的子路径，应用通过 workspace:* 引用包名；内部 src 不从其他包深链。失败边界是包内路径重构后应用出现 ERR_PACKAGE_PATH_NOT_EXPORTED；验证动作是写一个小脚本尝试导入内部路径，确认公开入口成功而内部路径失败，并把该检查纳入 CI。有条件导出可区分 import 与 require，但两种入口都要指向已经构建的产物。',
        '包名是跨项目唯一接口',
      ],
      [
        'peer dependency 控制共享实例',
        'React 插件通常把 react 声明为 peerDependency，让宿主应用提供同一版本；若插件自带 dependencies.react，可能出现两个 React 实例和 Hook 错误。失败边界是只看 npm 安装成功，不检查重复实例；验证动作是使用 pnpm why react、检查 pnpm list 的解析结果，并在运行时断言共享上下文只创建一个实例。若确实需要独立副本，应把它当作显式适配层并测试跨实例数据传递。',
        '共享运行时由宿主提供',
      ],
      [
        '依赖治理进入自动门禁',
        'CI 先 frozen-lockfile 安装，再运行 pnpm audit --prod、许可证策略和打包体积检查；升级依赖通过单独变更记录原因、兼容范围与回滚版本。失败边界是自动升级所有小版本却无人复测；验证动作是故意引入一个未声明包和一个高危依赖，确认安装或安全门禁会阻断，并保留审批记录。',
        '依赖变化也是代码变化',
      ],
    ],
  },
  {
    name: jsName(j5Stage, 'Vite 开发服务器和构建产物'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '已能运行 pnpm 脚本、创建 index.html，并理解 ESM 的静态导入和相对路径。',
    goal: '理解 Vite 开发时的原生 ESM 服务与生产构建差异，正确配置入口、base、public、环境变量、Source Map 和产物预览。',
    guidedPractice: '运行 pnpm exec vite 打开页面，在 Network 检查 /src/main.js 与依赖预构建响应；执行 pnpm exec vite build 后查看 dist/assets 哈希文件与 index.html 引用，再用 pnpm exec vite preview 访问生产预览。',
    independentPractice: '把一个带动态 import 的页面部署到子路径 /app/，分别配置 base 与资源 URL，构建后在 base 路径下运行预览；验证 public 文件、CSS、图片和动态 chunk 均能加载，且刷新深链接返回正确内容。',
    commonErrors: [
      '把开发服务器的 /src/main.js 路径直接写进生产资源地址，构建后文件名和目录并不相同。',
      '在 client 代码使用 process.env 读取配置，浏览器运行时没有 Node process，导致页面报 ReferenceError。',
    ],
    sourceRefs: [
      'Vite Guide. https://vite.dev/guide/',
      'Vite Build and Base. https://vite.dev/config/shared-options.html',
      'Vite Environment Variables. https://vite.dev/guide/env-and-mode.html',
    ],
    steps: [
      [
        '开发服务按需提供模块',
        'Vite dev server 直接向浏览器返回源码模块，并在首次发现第三方依赖时进行预构建；index.html 的 type="module" 入口触发整个加载图。失败边界是把只存在于 Node 的路径别名或全局对象写进浏览器模块；验证动作是查看 Network 的 404、source map 和 console，确认每个模块最终 URL 与 import 说明符一致。浏览器模块图不经过 Node 内置模块解析，路径别名必须由构建配置显式提供。',
        '开发链路不等于发布链路',
      ],
      [
        '构建执行分析输出与哈希',
        'vite build 会处理 HTML 与模块依赖，生成 dist 中的哈希资源，把 chunk 引用写回入口；base 决定产物 URL 前缀，public 目录文件会按原路径复制。失败边界是生产入口仍引用 /src/main.js，或 base 没配置导致静态资源全 404；验证动作是执行 vite preview，在 Network 检查 HTML、CSS、JS 与图片状态均为 200。构建后检查 chunk 数量和总传输体积，避免拆出大量互相等待的小文件。',
        '构建产物才是部署对象',
      ],
      [
        '环境变量只在构建期注入',
        'VITE_API_URL 通过 import.meta.env.VITE_API_URL 在模块中原位替换；未加前缀的 env 不会暴露给浏览器，秘密也不能依赖前端 env 保护。失败边界是更改 .env 后未重建即期待线上变化；验证动作是构建两份不同 env 的产物，搜索 dist 中的 URL，并确认浏览器只能看到预定义非秘密值。若配置允许空字符串，代码应回退到明确默认值并在启动日志记录来源。',
        '前端环境变量不是运行时秘密',
      ],
      [
        'Source Map 策略与部署关联',
        '开发环境默认方便映射源码，生产可生成 hidden source map 并只上传给监控平台，不作为公开静态文件发布；构建 ID 应与上传映射一致。失败边界是公开 map 暴露路径与源码，或监控收到的错误堆栈无法定位版本；验证动作是检查 dist 的 map 引用、上传日志与错误事件中的 release 字段。',
        '映射文件给调试服务而非所有人',
      ],
      [
        '预览、冒烟与回滚',
        '发布前对实际 dist 执行 vite preview 或静态服务器测试，访问首页、深链接、动态 chunk 与 404 路径；保存产物哈希和上一版本，发布失败时直接回切。失败边界是只在 dev server 点击成功就上线；验证动作是运行构建、预览、Playwright 冒烟三步，并记录每个响应头与页面错误。回切动作要在发布前演练，确认入口与资源来自同一旧版本快照。',
        '先验证产物再切换流量',
      ],
    ],
  },
  {
    name: jsName(j5Stage, 'ESLint、格式化和提交门禁'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能安装开发依赖、配置 package.json scripts，并理解 CommonJS 与 ESM 配置文件的差异。',
    goal: '配置 ESLint flat config、格式化规则、忽略目录与提交前检查，让可自动判定的代码质量在 CI 中稳定阻断。',
    guidedPractice: '创建 eslint.config.js，启用 recommended 规则并覆盖 src/**/*.js；故意引入未使用变量与未处理 Promise，运行 pnpm exec eslint . --max-warnings=0，再执行 --fix 观察哪些问题可自动修复、哪些必须人工处理。',
    independentPractice: '为一个 Vite 项目配置 ESLint、Prettier、lint-staged 与 CI；准备一个包含语法错误、未使用导入、危险 innerHTML 和格式差异的变更，验证本地与 CI 都能给出具体文件行号并阻止合并。',
    commonErrors: [
      '只运行 Prettier 后认为代码质量已经通过，格式化不理解未使用变量、错误捕获或危险 API。',
      '把 generated、dist 或依赖目录也纳入 lint，导致结果被大量无关文件淹没甚至误改生成代码。',
    ],
    sourceRefs: [
      'ESLint Configuration. https://eslint.org/docs/latest/use/configure/',
      'Prettier Options. https://prettier.io/docs/options',
      'lint-staged. https://github.com/lint-staged/lint-staged',
    ],
    steps: [
      [
        'ESLint 配置声明适用文件',
        'flat config 用 export default [{ files: ["src/**/*.js"], languageOptions: {...}, rules: {...} }] 明确作用域；recommended 提供基础正确性规则，业务规则再按风险添加。失败边界是配置未覆盖 .mjs 或测试目录，错误在 CI 中消失；验证动作是运行 eslint --print-config src/main.js，确认环境、parser 与关键规则实际生效。把 parserOptions.ecmaVersion 与 globals 固定下来，浏览器变量不会因默认配置被误报。规则文件本身也要在 CI 中通过语法检查，防止配置失效。',
        '规则必须真正覆盖目标文件',
      ],
      [
        '格式化与语义检查分工',
        'Prettier 处理缩进、引号和换行，ESLint 处理未使用变量、错误处理和 API 使用；通过 eslint-config-prettier 关闭冲突格式规则，避免两者反复改写。失败边界是用 ESLint --fix 批量改动业务语义；验证动作是先运行 format，再运行 lint，比较两次 diff，确认自动修复只改变空白与明确机械规则。规则只关闭真实格式冲突，不要为了减少告警整体关闭 recommended 集合。',
        '格式统一不提供语义保证',
      ],
      [
        '忽略规则只服务生成物',
        'dist、coverage、缓存的 node_modules 与构建报告应明确忽略，源码和测试不能被随意排除。失败边界是用 ignore 掩盖真实错误；验证动作是添加一个故意失败的 src 文件和一个 dist 文件，确认只有 src 报错，再用 git diff --name-only 检查 lint 没有修改生成目录。忽略路径应使用可审查的配置数组，临时忽略要附原因和删除期限。',
        '忽略项要能解释来源',
      ],
      [
        '提交门禁保持短而明确',
        'lint-staged 只对暂存文件运行 formatter 与 lint，CI 再跑全量 ESLint；脚本设置 --max-warnings=0，失败时输出文件、行号与规则名。失败边界是 pre-commit 需要完整构建导致开发者频繁绕过；验证动作是提交一个格式错误和未使用变量，确认钩子阻止，修复后同一个命令通过。自动修复后重新暂存文件，确保 CI 检查的是钩子实际写回的版本。',
        '本地快速，CI 全量',
      ],
      [
        '门禁结果可复现',
        '在 CI 使用 frozen-lockfile 安装并调用同一个 pnpm lint 脚本，不依赖 IDE 插件或开发者全局 ESLint；保存报告与 Node 版本。失败边界是本地插件自动修复但 CI 无插件，合并后失败；验证动作是在干净缓存环境运行 lint，再临时引入一个规则违规确认流水线退出码非零。若失败，先固定报告中的文件行号、规则名与 Node 版本，再在本地重放同一命令。',
        '同一条命令才算同一门禁',
      ],
    ],
  },
  {
    name: jsName(j5Stage, 'Vitest 单测与 Playwright 端到端'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能把业务逻辑拆成纯函数，运行过 pnpm test，并理解浏览器 DOM 与异步请求。',
    goal: '用 Vitest 验证函数与组件边界，用 Playwright 验证真实浏览器工作流，按风险分层选择测试并保持执行可重复。',
    guidedPractice: '为 parseAmount 写 Vitest 的参数化测试，再为列表页写 Playwright 测试：输入筛选、等待网络响应、断言可见行和空状态；故意让 API 延迟，观察等待策略与固定 timeout 的差别。',
    independentPractice: '为一个表单流程建立三层测试：纯函数单测、jsdom 组件交互、Playwright 真实提交；让每层至少有一个失败样例，修正后统计测试耗时，并删除与上层完全重复的脆弱断言。',
    commonErrors: [
      '单元测试过度模拟 DOM 与网络，最终只证明 mock 被调用，没有证明用户流程可完成。',
      '端到端测试到处 sleep，网络稍慢就失败，却掩盖了真实加载状态和竞态问题。',
    ],
    sourceRefs: [
      'Vitest Guide. https://vitest.dev/guide/',
      'Playwright Test. https://playwright.dev/docs/test-intro',
      'Playwright Best Practices. https://playwright.dev/docs/best-practices',
    ],
    steps: [
      [
        '测试金字塔按风险分工',
        '纯函数与状态转换适合 Vitest 的快速单测，真实网络、焦点、下载和跨页面流程适合 Playwright；组件层只在需要验证 DOM 绑定时使用 jsdom。失败边界是每个输入字段都写一个端到端用例，测试极慢且难定位；验证动作是给每个测试标注目标风险，删除只重复单测覆盖的昂贵流程。',
        '不同风险用不同层验证',
      ],
      [
        '单元测试控制依赖与时间',
        'Vitest 用 vi.fn、vi.spyOn、vi.useFakeTimers 控制回调与时钟，断言参数、返回值和错误；每个测试清理 spy 与 timer，避免跨用例污染。失败边界是依赖真实 Date.now 导致边界日期偶发失败；验证动作是连续倒序运行测试，检查同一用例输出不变，并用 coverage 找出未进入的 catch 分支。对每个 fake 断言调用次数与参数，而不只断言返回值，才能发现遗漏清理。',
        '单测的依赖必须可控',
      ],
      [
        '浏览器定位使用用户语义',
        'Playwright 优先 getByRole、getByLabel、getByText 定位，点击后用 expect(locator).toBeVisible() 自动等待；等待特定 response 或元素状态，不用无理由的 page.waitForTimeout。失败边界是 CSS 类名一改所有测试失效；验证动作是重命名样式类保持语义不变，确认主要流程测试仍通过，并检查 trace 中的定位器。定位失败时先检查可访问名称与角色，再决定是修测试还是修页面语义。',
        '从用户可感知语义写选择器',
      ],
      [
        '网络与存储建立隔离',
        '端到端测试使用专属测试账号或 route mock，捕获 request 记录方法、payload 与响应，失败时保留 trace、截图和 console。浏览器上下文之间隔离 storage。失败边界是测试共享登录态导致并行时互相覆盖；验证动作是并行运行同一用例两次，确认各自的 localStorage、IndexedDB 与网络结果互不影响。每个用例开始前清空 storage 与 cookies，结束后关闭浏览器上下文。',
        '每个浏览器上下文独立',
      ],
      [
        '失败证据与耗时同等重要',
        'CI 失败上传 Playwright report 与 Vitest 日志，显示测试名、步骤、请求和第一条异常；成功也记录测试数量与关键耗时，防止测试膨胀。失败边界是只看到退出码 1，没有 artifact；验证动作是故意制造一个网络失败和一个断言失败，确认报告能指向不同根因。报告应记录失败截图对应的 release 与浏览器版本，避免跨环境误判。',
        '测试失败也要可诊断',
      ],
    ],
  },
  {
    name: jsName(j5Stage, '模块化工程重构实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '已掌握 ESM、工具链、静态检查和分层测试，能识别项目中的全局状态与重复业务逻辑。',
    goal: '把单文件应用重构为领域逻辑、浏览器适配、数据访问与入口分层，保持测试可运行并消除循环依赖与隐式全局。',
    guidedPractice: '选一个超过 300 行的 main.js，列出 DOM、网络、计算与持久化职责；先给旧入口加测试，再逐段抽出 domain.js、api.js、storage.js 与 ui.js，每移动一段就跑一次测试并比较依赖图。',
    independentPractice: '完成一次小步重构：建立明确的 public 入口与 internal 模块，用 dependency injection 替换全局 fetch 和 clock；补充循环依赖检查、错误路径测试与构建冒烟，保持用户可见行为不变。',
    commonErrors: [
      '一次性移动所有文件并同时改业务规则，测试失败后无法区分结构变化与行为变化。',
      '抽取模块后仍通过模块级可变单例共享状态，只是把耦合从文件内转移到 import 图中。',
    ],
    sourceRefs: [
      'MDN JavaScript modules. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules',
      'Vite dependency graph. https://vite.dev/guide/features.html',
      'Google Engineering Practices refactoring. https://google.github.io/eng-practices/review/',
    ],
    steps: [
      [
        '先画现状依赖与职责',
        '标记每个区域访问的 DOM、网络、存储、时钟与全局变量，找出可以由纯函数替换的计算；将待修改点按用户可见行为分组。失败边界是只按文件行数切分，模块之间仍互相调用全部对象；验证动作是生成 import 清单，确认每个边都有方向和理由，并找出循环边作为第一批处理对象。',
        '重构从依赖图开始',
      ],
      [
        '先补行为测试再移动代码',
        '对旧入口覆盖成功、空数据、错误、取消和重复提交，测试通过后再移动实现；若旧代码无法测，先用最小适配器隔离 DOM 与网络。失败边界是没有基线就改结构，最后无法证明行为保持；验证动作是保存测试清单与运行结果，每完成一个小步都重新执行同一批用例。',
        '测试是重构的安全坐标',
      ],
      [
        '纯领域层不依赖宿主',
        'domain.js 只接收普通数据与显式依赖，返回结果或错误；api.js 负责 Fetch、超时和响应解析，ui.js 负责事件与渲染。失败边界是领域函数直接读取 localStorage，导致 Node 测试与多租户场景无法复用；验证动作是把领域模块导入 Node 测试，在无 document、window 的环境下完成全部核心用例。让领域模块接受 clock 与 idGenerator，也能消除测试对真实时间和随机数的依赖。',
        '核心逻辑离开浏览器也能运行',
      ],
      [
        '依赖注入替代隐藏单例',
        'createService({ fetchImpl, clock, storage }) 把外部能力作为参数，生产入口传入真实实现，测试传入 fake；模块顶层只导出工厂和类型。失败边界是多个工厂仍引用同一个模块级数组；验证动作是创建两个 service，交错更新后断言状态隔离，并检查测试之间不需要 reset 全局模块。工厂创建完成后冻结依赖对象，防止运行中替换实现造成行为漂移。',
        '外部能力在边界注入',
      ],
      [
        '结构变化后重新做全链路验收',
        '完成重构后运行 lint、Vitest、Playwright、build 与静态预览，比较旧新版本的网络行为、错误文案、焦点和 URL。失败边界是单元测试全绿但生产构建仍引用被删除路径；验证动作是在空缓存浏览器执行关键用户路径，并查看构建产物中是否残留旧模块或循环警告。若新旧版本请求顺序不同，应记录首个交互差异，而不是只比较最终截图。',
        '最后用产物和用户流程验收',
      ],
    ],
  },
];

// ── J6 性能、安全与部署 ─────────────────────────────────────────────────────
const j6Stage = '性能、安全与部署';

const JAVASCRIPT_J6_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: jsName(j6Stage, '长任务、渲染与交互延迟'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '会使用 DevTools Performance，知道调用栈、事件循环和 requestAnimationFrame，并能记录页面交互耗时。',
    goal: '从 INP、长任务和布局抖动定位交互延迟，采用减少主线程工作、批处理 DOM 与任务切片改善可感知响应。',
    guidedPractice: '录制一次表单筛选交互，在 Performance 面板标记 input、script、layout、paint 区间；查找超过 50ms 的任务和反复强制布局调用，把连续读写 offsetWidth 的循环改成先读后写再复测。',
    independentPractice: '为一张动态表格建立性能预算：筛选响应 p75 小于 200ms、最长任务小于 100ms；记录优化前 trace，改造渲染与计算后，用同一设备和数据量比较 INP、总任务和 DOM 数量。',
    commonErrors: [
      '只看页面加载总时间，不测输入到下一帧的交互延迟，用户点击后仍长时间无反馈。',
      '在循环里交替读取布局属性和修改样式，触发多次同步布局，把普通更新放大成长任务。',
    ],
    sourceRefs: [
      'web.dev Interaction to Next Paint. https://web.dev/articles/inp',
      'web.dev Optimize long tasks. https://web.dev/articles/optimize-long-tasks',
      'Chrome DevTools Performance. https://developer.chrome.com/docs/devtools/performance/',
    ],
    steps: [
      [
        '先定义可感知的指标',
        '记录用户输入时间、事件处理开始结束、下一帧绘制与交互完成时间，关注 p75 INP 而不是单次平均值；对搜索、排序和打开详情分别建立场景。失败边界是只看 Lighthouse 分数，不知道哪个真实操作慢；验证动作是用 Performance 与自定义 performance.mark/measure 对齐同一交互，导出 trace 并保存输入条件。在每个场景记录脚本、样式、布局与绘制分段，才能判断优化应落在哪一层。',
        '指标必须对应用户动作',
      ],
      [
        '识别长任务中的主因',
        '长任务可能来自同步 JSON 解析、大数组排序、复杂正则或一次创建大量节点；Performance 的 Bottom-Up 和 Call Tree 显示自耗时与调用者。失败边界是把 CPU 采样中的空闲帧误当优化成功；验证动作是记录函数输入规模、调用次数和自耗时，并用一次小数据对照确认热点随规模增长。对同一数据规模重复采样至少三次，用中位数排除单次设备波动。',
        '按调用树追热点',
      ],
      [
        '避免强制同步布局',
        '读取 offsetWidth、getBoundingClientRect 后再写 style 会触发浏览器立即计算布局；循环中反复读写形成 layout thrashing。应批量读取尺寸，再统一写样式，或用 requestAnimationFrame 把更新放到下一帧。失败边界是改完仍每次 append 一个节点后读尺寸；验证动作是录制优化前后 frame 与 Layout 次数，并比较同一数据量的任务时长。把尺寸读取移到更新前一次性完成，并用变量保存，可在代码层避免重复查询。',
        '读写分批减少布局抖动',
      ],
      [
        '只渲染当前需要的内容',
        '长列表使用分页、虚拟化或先渲染摘要，避免一次创建数千个 DOM 节点；计算与 DOM 更新分离，输入时先给即时反馈，再异步完成重结果。失败边界是虚拟化后焦点和滚动位置跳变；验证动作是键盘移动到列表末尾、改变筛选和刷新数据，确认可见项、activeElement 与滚动锚点均符合预期。',
        '减少工作量和保持导航同样重要',
      ],
      [
        '用回归门槛保护体验',
        '把关键脚本预算、长任务阈值和交互场景写入 CI 或发布检查，保存优化前、优化后 trace 与设备信息；每次大功能上线重跑相同数据。失败边界是只在开发机测一次，用户低端设备仍明显卡顿；验证动作是在 CPU 4x throttle 与窄屏环境重复测试，确认 p75 指标和新增长任务没有越过预算。',
        '性能预算是发布条件',
      ],
    ],
  },
  {
    name: jsName(j6Stage, '包体、代码分割和缓存'),
    track,
    contentStatus: 'reviewed',
    minutes: 39,
    prerequisite: '能运行 Vite build，查看 bundle 产物与 Network，知道动态 import 和 HTTP 缓存的基本含义。',
    goal: '分析包体构成，使用动态导入、合理分块和内容哈希减少首屏传输，并设计 HTML、哈希资源与 API 的缓存策略。',
    guidedPractice: '执行 vite build 并打开构建报告，找出最大的依赖与重复模块；把非首屏编辑器改为动态 import，比较入口 chunk 大小、请求数与首屏时间，检查文件名哈希变化。',
    independentPractice: '为一个仪表盘拆分核心壳、图表和导出模块，设置各自加载条件；验证改动一个次要模块只改变对应哈希，并为 HTML、静态资源与 API 写不同缓存策略的检查。',
    commonErrors: [
      '把大型图表库挂在首屏入口，页面首次加载时下载用户尚未触发的功能代码。',
      '给 index.html 配置长期 immutable 缓存，部署后用户仍拿到引用旧哈希文件的旧入口。',
    ],
    sourceRefs: [
      'Vite Build. https://vite.dev/guide/build.html',
      'web.dev Code splitting. https://web.dev/articles/reduce-javascript-payloads-with-code-splitting',
      'MDN HTTP caching. https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching',
    ],
    steps: [
      [
        '读取包体构成而非猜大',
        '构建后按 chunk 查看 raw、gzip 体积、模块树和重复依赖，先处理首屏路径上的大依赖；图片、字体和 CSS 也算传输预算。失败边界是只比较未压缩源码大小，忽略 gzip 与 brotli 差异；验证动作是保存构建报告，在 Network 使用真实压缩头比较 transferSize 与资源优先级。若某依赖只在开发时使用，应确认它没有被打进生产 chunk，再决定是否替换。',
        '先找到首屏真正下载的代码',
      ],
      [
        '动态导入把功能移出首屏',
        'const { createChart } = await import("./chart.js") 可让图表代码在用户打开图表时下载，Vite 会生成独立 chunk；加载期间显示忙碌状态并处理失败。失败边界是入口立即 await import，结果仍阻塞首屏；验证动作是查看 Network 请求时序，确认未触发功能前对应 chunk 未下载，触发后才出现。加载失败时提供重试并记录 chunk 名称，能区分网络问题与部署路径错误。',
        '按用户路径切分代码',
      ],
      [
        '分块围绕稳定边界',
        '大型独立依赖、低频页面和共享运行时适合拆块，但过度切分会产生大量小请求和瀑布。使用构建器默认分块先测，再按模块实际变化频率调整，不以体积最小作为唯一目标。失败边界是手工分包把强依赖拆到不同 chunk，加载顺序变差；验证动作是模拟慢网记录关键请求链与最长等待，比较调整前后的首屏完成时间。',
        '分块要减少关键路径',
      ],
      [
        '内容哈希配合缓存头',
        '构建产物文件名带内容哈希后可设置 Cache-Control: public, max-age=31536000, immutable；index.html 应使用 no-cache 或短缓存，让浏览器重新验证入口。失败边界是资源不带哈希却设 immutable，修复发布后用户仍加载旧文件；验证动作是部署两个版本，检查 HTML 引用新哈希且旧资源未被新页面请求。对带查询参数或重定向的资源确认缓存键稳定，避免每次命中新地址。',
        '入口常新，资源长期缓存',
      ],
      [
        '发布后验证缓存矩阵',
        'Playwright 记录 HTML、JS、CSS、字体和 API 的 status、age、etag 与 cache-control；首次访问与二次访问分别验证命中，强制刷新与版本切换验证更新。失败边界是本地 dev server 没有生产缓存头，测试结果失真；验证动作是对实际 CDN 预览 URL 跑缓存脚本，确认 HTML 更新和哈希资源复用同时成立。缓存测试应使用全新浏览器上下文清除本地缓存，不能复用开发会话。',
        '缓存效果在部署环境验证',
      ],
    ],
  },
  {
    name: jsName(j6Stage, 'XSS、第三方脚本与 CSP'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 DOM 文本与 HTML 的差异，能检查响应头和浏览器 Security 面板，并知道同源脚本可读取页面数据。',
    goal: '识别反射型、存储型和 DOM 型 XSS 注入路径，使用文本渲染、协议校验、CSP 与第三方脚本治理降低执行面。',
    guidedPractice: '构造一个把 URL 参数写入 innerHTML 的页面，用 <img src=x onerror=...> 验证脚本执行；改为 textContent 后复测，再加 Content-Security-Policy: default-src self 与 script-src self，观察被阻止的请求和 CSP 报告。',
    independentPractice: '为一个含 Markdown 预览和第三方统计的应用做安全检查：保留安全渲染器、校验链接协议、移除内联事件、配置 nonce 或 hash，并证明未授权脚本与内联脚本都无法执行。',
    commonErrors: [
      '只用正则删除 script 标签，却放过 onerror、javascript: URL 和 SVG 等可执行入口。',
      '为了加载第三方统计而加入 unsafe-inline 与宽松 connect-src，使 CSP 对主要攻击失去约束。',
    ],
    sourceRefs: [
      'OWASP Cross Site Scripting Prevention. https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html',
      'MDN Content Security Policy. https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP',
      'W3C Content Security Policy Level 3. https://www.w3.org/TR/CSP3/',
    ],
    steps: [
      [
        '识别不可信数据到执行汇聚点',
        '用户输入、URL、API 文本、第三方内容和 postMessage 都可能进入 innerHTML、insertAdjacentHTML、eval、new Function 或危险 URL 属性；先用静态搜索和运行时追踪列出汇聚点。失败边界是只检查表单输入，忽略服务端返回后被前端拼接的字段；验证动作是给每个来源注入唯一哨兵字符串，观察它最终进入文本节点还是 HTML 解析器。',
        '沿着数据流寻找执行点',
      ],
      [
        '优先使用安全 DOM API',
        '普通文本用 textContent 或 createTextNode，属性值用 setAttribute 并校验协议，富文本必须经过可信且持续更新的 HTML sanitizer 与固定允许列表。失败边界是 sanitizer 配置允许任意 style 或 iframe；验证动作是用 OWASP 常见载荷与自定义属性和 URL 样例测试输出，检查 DOM 中没有新脚本节点或事件属性。富文本渲染后仍要在真实浏览器检查最终 DOM，不能只相信 sanitizer 的字符串输出。',
        '输出编码由正确 API 保证',
      ],
      [
        'CSP 缩小可执行脚本面',
        'CSP 用 script-src self 或 nonce/hash 限制脚本来源，用 object-src none、base-uri self 与 frame-ancestors 限制其他入口；先以 Report-Only 收集违规，再切换强制策略。失败边界是启用后旧内联脚本全部失效但未准备 nonce；验证动作是分别注入内联脚本和外部脚本，检查前者被阻止、允许的 nonce 脚本正常执行并产生报告。违规报告需包含 blockedURI、violatedDirective 与 documentURI，再按来源修复或移除第三方。',
        'CSP 是纵深防御不是唯一防线',
      ],
      [
        '第三方脚本按最小权限接入',
        '每个第三方脚本记录所有者、版本、域名、用途与移除方式，优先服务端代理或静态统计；动态插入脚本前检查 URL，使用 integrity 与 referrerpolicy，CSP connect-src 只放必要域名。失败边界是供应商脚本拥有全页权限并读取敏感 DOM；验证动作是查看 Network、CSP 报告和脚本对象，确认其只能访问声明资源且无未知域名。',
        '第三方代码也进入信任边界',
      ],
      [
        '安全回归覆盖绕过路径',
        '测试输入应包含标签、事件属性、编码实体、大小写混合协议、SVG 与嵌套上下文，并在真实浏览器断言无 alert、无外联和 DOM 无非预期节点；CSP 报告作为发布 artifact。失败边界是只在字符串层断言被转义，浏览器仍可能二次解码；验证动作是运行 Playwright 安全用例并检查 console、request 与页面内容三个证据。',
        '用浏览器证明没有执行',
      ],
    ],
  },
  {
    name: jsName(j6Stage, '错误边界、日志和真实用户监控'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能捕获 Promise 拒绝与同步异常，知道生产 Source Map 作用，并能阅读浏览器 Performance 和 Network。',
    goal: '建立前端异常采集、脱敏、去重和版本关联机制，区分脚本错误、资源错误与用户可见回归，并用真实用户指标闭环。',
    guidedPractice: '在测试页面注册 window.onerror、unhandledrejection 与资源 error 监听，制造一次同步错误、Promise 拒绝和 404 图片；把 name、message、stack、release、url 与采样 ID 发送到受控日志接口，再上传 hidden source map 验证堆栈可还原。',
    independentPractice: '为一个应用配置错误监控 SDK：设置 release、environment、采样和 beforeSend 脱敏，使用 Web Vitals onINP/onLCP 上报；通过一次性故障页验证错误分组、请求关联和修复版本回落。',
    commonErrors: [
      '监控 SDK 直接记录完整用户输入、URL 查询和 token，排障数据反而成为隐私泄露面。',
      '错误堆栈指向压缩文件名却没有上传同版本 Source Map，收到大量无法处理的 minified 错误。',
    ],
    sourceRefs: [
      'MDN Window error event. https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event',
      'web.dev Web Vitals. https://web.dev/articles/vitals',
      'OpenTelemetry JavaScript. https://opentelemetry.io/docs/languages/js/',
    ],
    steps: [
      [
        '异常入口要覆盖完整生命周期',
        'window.onerror 或 addEventListener("error") 捕获同步脚本错误，unhandledrejection 捕获未处理 Promise 拒绝，资源加载失败通过捕获阶段的事件看到 target；框架错误边界只能处理组件树内错误。失败边界是只监听 try/catch 内部，遗漏事件回调和异步队列；验证动作是分别触发三类错误，确认每条事件都有 error id 与页面路径。错误监听器本身必须包在保护逻辑中，避免采集失败再次触发上报循环。',
        '收集入口要覆盖任务类型',
      ],
      [
        '日志保留因果与版本',
        '错误记录至少包含事件时间、release、environment、route、user agent、request id、错误 name/message/stack 与 cause 链；不要用随机页面路径代替错误指纹。失败边界是同一错误每次带不同时间戳导致无法分组；验证动作是连续触发同一错误三次，比较指纹并确认发布版本变化后可区分新错误。错误指纹可由 name、消息模板与顶层业务栈组成，但不应包含用户正文和完整 URL。',
        '版本让错误能够归因',
      ],
      [
        '脱敏与采样在上报前完成',
        'beforeSend 中删除 Authorization、Cookie、密码字段与个人信息，URL 只保留 path，正文按风险采样；对高频重复错误限速但保留首个与修复版本。失败边界是网络请求失败又触发错误上报形成循环；验证动作是检查上报 payload、网络请求次数和浏览器 Application 数据，确认无敏感值且限速生效。采样率按页面和错误类型配置，低概率故障要保留完整堆栈直到修复验证完成。',
        '监控数据本身也要最小化',
      ],
      [
        'RUM 指标连接用户影响',
        '使用 Web Vitals 注册 onLCP、onCLS、onINP，按页面、版本、设备和网络类型聚合分位数，并关联错误率与请求失败。失败边界是只看平均值，掩盖慢设备上的长尾；验证动作是模拟慢网和 CPU 降速，确认指标进入同一 release，且页面发布回归能触发阈值告警。指标上报应批量且异步，使用 sendBeacon 时也要限制页面卸载场景的数据量。',
        '真实用户分布比实验室单一分数重要',
      ],
      [
        '告警必须指向可执行动作',
        '为错误率、INP p75、关键 API 失败和 CSP 违规设置阈值，通知包含仪表盘、样本 trace、最近发布和回滚入口；修复后在相同 release 条件确认指标回落。失败边界是告警只发到公共频道无人负责；验证动作是制造一次受控故障，记录检测时间、负责人、止损动作与恢复证据，完成一次闭合演练。',
        '监控最后要落到止损和修复',
      ],
    ],
  },
  {
    name: jsName(j6Stage, '静态站点、CDN 与环境配置'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '能构建 Vite 产物，理解 HTTP 缓存、相对路径和环境变量，并能通过命令行访问部署预览。',
    goal: '把静态 JavaScript 应用发布到 CDN，配置 base、路由回退、缓存、安全响应头和构建期环境，完成冒烟与回滚验证。',
    guidedPractice: '构建 dist 后用静态服务器模拟 CDN，设置 HTML no-cache、哈希资源 immutable、gzip/brotli 与安全响应头；访问 /、/assets/app-*.js、未知子路由和不存在资源，记录状态码、content-type 与 cache-control。',
    independentPractice: '为应用设计 staging 与 production 两套构建配置，分别注入 API URL 和 release ID；发布到带子路径的预览环境，执行 Playwright 冒烟、缓存验证和一次版本回滚，确保旧产物仍可恢复。',
    commonErrors: [
      '客户端路由配置直接回退到 index.html，连 assets 下不存在的文件也返回 HTML，掩盖资源 404。',
      'API 地址在构建时写死为公司内网，正式 CDN 用户请求失败，却又误以为是跨域后端故障。',
    ],
    sourceRefs: [
      'Vite Static Deploy. https://vite.dev/guide/static-deploy.html',
      'Vite base option. https://vite.dev/config/shared-options.html#base',
      'MDN HTTP headers. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers',
    ],
    steps: [
      [
        '构建配置绑定部署位置',
        'vite build --base=/app/ 会让入口与资源引用带正确前缀；同一产物不能同时假设根路径和子路径。public 中的文件保持原 URL，需要哈希缓存的内容应由构建流程生成。失败边界是预览在根路径通过，上传子目录后 JS 返回 404；验证动作是检查 dist/index.html 引用、Network 的绝对 URL 和页面的 import.meta.env.BASE_URL。若站点需要在多个子路径复用，应分别构建并记录每个产物的 base 与 release。',
        '部署路径是构建输入',
      ],
      [
        '路由回退只服务页面路径',
        '单页应用可把没有扩展名的页面路由回退到 index.html，但 /assets/* 和带文件扩展名的资源应保留真实 404；服务端路由与客户端路由的优先级要写进配置。失败边界是缺失图片返回 HTML，img 的 onerror 与缓存判断全部失真；验证动作是分别请求已知页面、深链接、缺失 JS 与缺失图片，断言状态码与 content-type。',
        '回退规则不能吞掉资源错误',
      ],
      [
        '缓存与安全头一起配置',
        'HTML 使用 no-cache，带内容哈希的 JS/CSS 可长期 immutable；同时设置 X-Content-Type-Options: nosniff、Referrer-Policy 与适合站点的 CSP。失败边界是只设缓存而 MIME 类型错误，浏览器拒绝执行；验证动作是查看响应头的 content-type、cache-control、etag 与 CSP，并在二次访问中确认哈希资源缓存、HTML 重新验证。若 CDN 改写了 content-type，错误应由部署配置修正，不能靠浏览器猜测。发布检查应同时保存原始响应头作为证据。',
        '缓存策略与文件身份一致',
      ],
      [
        '环境在构建时固化并留痕',
        'VITE_API_URL、release、buildTime 由 CI 注入，构建日志记录来源分支、commit 与配置摘要；staging 和 production 使用不同项目或上下文，禁止把生产秘密放进前端。失败边界是改 CDN 环境变量却不重建，页面仍调用旧 API；验证动作是搜索产物中的预期 URL，运行请求断言，并从页面错误事件读取相同 release。构建摘要应包含锁文件哈希与 env key 清单，但不记录秘密值本身。',
        '静态产物不能运行时读秘密',
      ],
      [
        '发布、冒烟与回滚形成闭环',
        '先上传不可变资源，再切换入口或缓存版本，随后运行 CDN URL 冒烟：首页、深链接、动态 chunk、API 请求和 CSP；失败则切回上一入口。保留上一版完整产物和配置清单。失败边界是只验证首页 200，未加载交互 chunk；验证动作是记录发布前后版本号、Playwright 结果与回滚耗时，并让未参与开发的人按手册重做一次。',
        '发布成功以用户路径通过为准',
      ],
    ],
  },
  {
    name: jsName(j6Stage, 'JavaScript 企业应用毕业项目'),
    track,
    contentStatus: 'reviewed',
    minutes: 51,
    prerequisite: '完成 J0-J6 前五门课程，能独立实现模块化页面、异步请求、测试、构建和静态部署。',
    goal: '交付一个可运行、可测试、可观测、可安全回滚的 JavaScript 应用，并以真实数据证明语言语义、工程质量与生产边界。',
    guidedPractice: '选定带筛选、分页、离线缓存和错误恢复的条目管理应用，完成规格、模块边界、API 契约、Vitest 单测与 Playwright 主流程；录制发布前性能 trace、CSP 结果和构建报告。',
    independentPractice: '独立完成毕业交付：包含表单校验、取消请求、IndexedDB 缓存、可访问键盘流程、XSS 回归、错误上报、CDN 发布和一次失败回滚演练；提交运行手册、测试证据和复盘记录。',
    commonErrors: [
      '只展示顺利路径的页面截图，没有请求失败、离线、取消、CSP 和回滚证据。',
      '把框架或构建工具当成掌握语言的证明，无法解释闭包、this、事件循环或错误传播为何如此设计。',
    ],
    sourceRefs: [
      'MDN JavaScript Guide. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
      'web.dev Web Vitals. https://web.dev/articles/vitals',
      'OWASP Top 10. https://owasp.org/www-project-top-ten/',
    ],
    steps: [
      [
        '范围与验收先冻结',
        '把用户任务、非目标、数据来源、权限、离线范围和浏览器版本写进验收单；每个功能对应一个可观察结果与测试层。失败边界是不断添加页面导致没有一条流程完整；验证动作是让另一位学习者只读规格实现一条冒烟脚本，若需要口头补充就修订规格。',
        '范围小但每个边界完整',
      ],
      [
        '语言机制在实现中有证据',
        '在架构说明里解释模块作用域、闭包封装、对象/原型选择、this 处理、事件循环调度、Promise 取消与错误链；在代码中用测试证明状态隔离、旧请求不落地和资源清理。失败边界是架构图与实际代码不一致；验证动作是抽取一个闭包状态、一个取消请求和一个错误传播案例走查，指出测试名称与代码位置。',
        '机制要能落到代码和测试',
      ],
      [
        '质量与安全共同验收',
        '流水线执行 lint、type-free 语法检查、Vitest、Playwright、构建、依赖审计与安全用例；测试覆盖不可信文本、协议 URL、CSP、键盘焦点和重复提交。失败边界是安全测试只在文档描述没有自动断言；验证动作是制造一次 XSS 注入和一次无键盘入口，确认测试失败后再修复到通过。依赖审计和生产安装都应使用锁定版本，避免扫描对象与实际运行包不同。',
        '功能和防线一起自动化',
      ],
      [
        '性能与可观测性能解释发布',
        '保存首屏、INP、包体、缓存命中和错误率的基线，对发布版本记录 commit、build ID 与 Source Map；超预算时停止发布。失败边界是指标面板存在但没有负责人和阈值；验证动作是故意加载一个慢接口与一个大 chunk，确认告警、样本 trace 和回滚判断都能触发。指标回落应在同一交互负载下确认，不能用减少测试数据制造性能改善。',
        '用指标决定是否继续放量',
      ],
      [
        '运行手册与复盘完成交付',
        '手册写明安装、构建、环境变量、发布、验证、日志位置、常见故障、停止开关与回滚命令；复盘中按需求、实现、测试、部署分别列证据和缺口。失败边界是回滚没有演练或旧版本无法读取当前数据；验证动作是发布一个已知问题版本并回切，记录检测、止损与恢复时间，再让新人按手册独立启动一次。',
        '毕业标准是别人也能运行和恢复',
      ],
    ],
  },
];

const jsExample = (
  title: string,
  language: string,
  code: string,
  output: string,
): LearningV2LessonExample => ({ title, language, code, output });

const JAVASCRIPT_EXAMPLE_SETS: Readonly<Record<string, readonly LearningV2LessonExample[]>> = {
  [jsName(j0Stage, '浏览器脚本、模块与 Node 进程')]: [
    jsExample(
      '用两种入口探测全局对象',
      'Node.js ESM',
      `// probe.mjs
console.log('globalThis keys', [
  'setTimeout',
  'process',
  'document',
].filter((key) => key in globalThis));
console.log('top-level this', this);
try {
  console.log(document.title);
} catch (error) {
  console.log(error.name, error.message);
}

// 执行：node probe.mjs`,
      `globalThis keys [ 'setTimeout', 'process' ]
top-level this undefined
ReferenceError document is not defined`,
    ),
    jsExample(
      '共享计算模块同时服务浏览器和 Node',
      'JavaScript ESM',
      `// cart.mjs
export function total(lines) {
  if (!Array.isArray(lines)) throw new TypeError('lines must be an array');
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}

// node-adapter.mjs
import { total } from './cart.mjs';
const lines = [{ price: 12.5, qty: 2 }, { price: 3, qty: 4 }];
console.log('total', total(lines).toFixed(2));

// 执行：node node-adapter.mjs`,
      `total 37.00
同一模块不读取 window、document 或 process，浏览器入口也可直接 import。`,
    ),
    jsExample(
      '检查本地模块解析到哪个 URL',
      'Node.js ESM',
      `// resolve.mjs
const entries = ['./cart.mjs', './missing.mjs'];
for (const specifier of entries) {
  try {
    const url = import.meta.resolve(specifier);
    console.log('resolved', specifier, '->', new URL(url).pathname);
  } catch (error) {
    console.log('failed', specifier, error.code ?? error.name);
  }
}

// 执行：node resolve.mjs`,
      `resolved ./cart.mjs -> /current/project/cart.mjs
failed ./missing.mjs ERR_MODULE_NOT_FOUND
相对说明符解析依赖当前模块 URL，目录名不会自动补 index.js。`,
    ),
    jsExample(
      '让定时器与进程生命周期一致',
      'Node.js',
      `// lifecycle.mjs
let ticks = 0;
const timer = setInterval(() => {
  ticks += 1;
  console.log('tick', ticks, 'handles', process._getActiveHandles().length);
  if (ticks === 3) {
    clearInterval(timer);
    console.log('timer cleared');
  }
}, 50);

// 执行：node lifecycle.mjs; echo exit=$LASTEXITCODE`,
      `tick 1 handles 2
tick 2 handles 2
tick 3 handles 2
timer cleared
exit=0`,
    ),
    jsExample(
      '同一组 fixture 在 Node 内做双入口契约测试',
      'Node.js test',
      `// cart.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { total } from './cart.mjs';

const fixtures = [
  { name: 'empty', lines: [], expected: 0 },
  { name: 'mixed', lines: [{ price: 9.9, qty: 2 }], expected: 19.8 },
];

for (const item of fixtures) {
  test(item.name, () => assert.equal(total(item.lines), item.expected));
}

// 执行：node --test cart.test.mjs`,
      `ok 1 - empty
ok 2 - mixed
# pass 2
# fail 0`,
    ),
  ],
  [jsName(j0Stage, 'Node、pnpm、Vite 与目录骨架')]: [
    jsExample(
      '记录真实的 Node 与 pnpm 环境',
      'PowerShell',
      `node --version
pnpm --version
node -p "JSON.stringify({ execPath: process.execPath, versions: process.versions }, null, 2)"`,
      `v24.18.1
11.20.0
{
  "execPath": "C:\\\\Program Files\\\\nodejs\\\\node.exe",
  "versions": { "node": "24.18.1", "v8": "13.6" }
}`,
    ),
    jsExample(
      '生成最小 ESM 清单并检查入口语法',
      'Node.js ESM',
      `import { readFile, writeFile } from 'node:fs/promises';

const manifest = {
  name: 'js-skeleton',
  private: true,
  type: 'module',
  scripts: { check: 'node --check src/math.js' },
};
await writeFile('package.json', JSON.stringify(manifest, null, 2));
await writeFile('src/math.js', 'export const sum = (...xs) => xs.reduce((a, b) => a + b, 0);\\n');
console.log(await readFile('package.json', 'utf8'));
console.log('check manifest', JSON.parse(await readFile('package.json', 'utf8')).type);`,
      `{
  "name": "js-skeleton",
  "private": true,
  "type": "module",
  "scripts": { "check": "node --check src/math.js" }
}
check manifest module`,
    ),
    jsExample(
      '锁文件不一致时阻止安装',
      'PowerShell',
      `pnpm add -D vite vitest
pnpm install --frozen-lockfile
pnpm list --depth 0
# 失败实验：先手工修改 package.json 中 vite 的版本，再重跑 frozen 安装`,
      `devDependencies:
vite 7.2.2
vitest 4.0.9
ERR_PNPM_OUTDATED_LOCKFILE Cannot install with "frozen-lockfile"
because package.json and pnpm-lock.yaml are not in sync`,
    ),
    jsExample(
      '从 Vite 入口请求真实模块',
      'Vite + PowerShell',
      `// index.html
<main id="app"></main>
<script type="module" src="/src/main.js"></script>

// src/main.js
document.querySelector('#app').textContent = 'ready';

// 验证
pnpm dev --host 127.0.0.1
Invoke-WebRequest http://127.0.0.1:5173/src/main.js | Select-Object StatusCode, Headers`,
      `StatusCode 200
content-type: text/javascript
入口模块返回成功，DevTools Network 中 main.js 不再出现 404。`,
    ),
    jsExample(
      '用脚本冻结目录职责和重建步骤',
      'Node.js',
      `import { access } from 'node:fs/promises';

const required = ['src/lib/cart.js', 'src/web/main.js', 'scripts/verify.mjs'];
const missing = [];
for (const file of required) {
  try {
    await access(file);
    console.log('present', file);
  } catch {
    missing.push(file);
  }
}
if (missing.length) throw new Error('missing: ' + missing.join(', '));
console.log('skeleton valid');

// 执行：node scripts/verify.mjs`,
      `present src/lib/cart.js
present src/web/main.js
present scripts/verify.mjs
skeleton valid`,
    ),
  ],
  [jsName(j0Stage, '变量、表达式、分支与循环')]: [
    jsExample(
      'const 固定绑定但对象仍可修改',
      'Node.js',
      `const cart = { items: [] };
cart.items.push({ sku: 'A-1', qty: 2 });
console.log('items', cart.items.length);
console.log('frozen', Object.isFrozen(cart));
try {
  cart = { items: [] };
} catch (error) {
  console.log(error.name, error.message);
}`,
      `items 1
frozen false
TypeError Assignment to constant variable.`,
    ),
    jsExample(
      '用短路表达式保留合法零值',
      'JavaScript',
      `const input = { count: 0, label: '', coupon: null };
const count = input.count || 10;
const safeCount = input.count ?? 10;
const label = input.label ?? '未命名';
const coupon = input.coupon?.code ?? 'NONE';
console.log({ count, safeCount, label, coupon });`,
      `{ count: 10, safeCount: 0, label: '', coupon: 'NONE' }
?? 只替换 null 或 undefined，不会把合法 0 和空字符串当成缺失。`,
    ),
    jsExample(
      '逐项验证 truthy 与严格相等',
      'Node.js',
      `const values = [false, 0, -0, 0n, '', null, undefined, NaN, '0', []];
for (const value of values) {
  console.log(typeof value, String(value), Boolean(value));
}
console.log('loose', 0 == '0', 'strict', 0 === '0');
console.log('array', [1] == 1, [1] === 1);`,
      `boolean false false
number 0 false
number 0 false
bigint 0 false
string  false
object null false
undefined undefined false
number NaN false
string 0 true
object  true
loose true strict false
array true false`,
    ),
    jsExample(
      '会员折扣显式拒绝未知等级',
      'Node.js',
      `export function payable(amount, tier) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('bad amount');
  switch (tier) {
    case 'basic': return amount;
    case 'gold': return amount >= 100 ? amount - 20 : amount;
    default: throw new RangeError('unknown tier: ' + tier);
  }
}
for (const sample of [[99, 'gold'], [100, 'gold'], [50, 'vip']]) {
  try { console.log(sample.join('/'), payable(...sample)); }
  catch (error) { console.log(sample.join('/'), error.message); }
}`,
      `99/gold 99
100/gold 80
50/vip unknown tier: vip`,
    ),
    jsExample(
      '每轮循环拥有独立绑定并能提前终止',
      'Node.js',
      `const tasks = ['load', 'validate', 'save', 'notify'];
const callbacks = [];
for (let index = 0; index < tasks.length; index += 1) {
  callbacks.push(() => tasks[index] + ':' + index);
}
console.log(callbacks.map((run) => run()).join('|'));

let attempts = 0;
while (attempts < 10) {
  attempts += 1;
  if (attempts === 3) break;
}
console.log('attempts', attempts);`,
      `load:0|validate:1|save:2|notify:3
attempts 3`,
    ),
  ],
  [jsName(j0Stage, '函数、作用域与严格模式')]: [
    jsExample(
      '函数入口集中校验调用契约',
      'Node.js',
      `function joinName(first, last = '') {
  if (typeof first !== 'string' || !first.trim()) {
    throw new TypeError('first must be a non-empty string');
  }
  return [first.trim(), String(last).trim()].filter(Boolean).join(' ');
}
console.log(joinName(' Ada ', ' Lovelace '));
try { joinName(undefined, 'Lovelace'); }
catch (error) { console.log(error.name, error.message); }`,
      `Ada Lovelace
TypeError first must be a non-empty string`,
    ),
    jsExample(
      '词法作用域在定义位置确定',
      'JavaScript',
      `const message = 'module';
function outer() {
  const message = 'outer';
  return function inner() {
    return message;
  };
}
const otherScope = { message: 'caller', run: outer() };
console.log('defined value', otherScope.run());
console.log('caller value', otherScope.message);`,
      `defined value outer
caller value caller
内部函数读取定义位置的外层绑定，而不是调用对象的 message。`,
    ),
    jsExample(
      '严格模式阻止隐式全局变量',
      'Node.js ESM',
      `'use strict';
function legacySloppyMode() {
  accidentalGlobal = 1;
}
try {
  legacySloppyMode();
} catch (error) {
  console.log(error.name, error.message);
}
console.log('global leaked', Object.hasOwn(globalThis, 'accidentalGlobal'));

// 执行：node implicit-global.mjs`,
      `ReferenceError accidentalGlobal is not defined
global leaked false`,
    ),
    jsExample(
      '在暂时性死区中读取变量会立即失败',
      'Node.js',
      `function readBeforeInit() {
  try {
    console.log(value);
  } catch (error) {
    console.log('before declaration', error.name);
  }
  const value = 42;
  console.log('after declaration', value);
}
readBeforeInit();

function hoistedVar() {
  console.log('var before assignment', value);
  var value = 42;
}
hoistedVar();`,
      `before declaration ReferenceError
after declaration 42
var before assignment undefined`,
    ),
    jsExample(
      'ESM 顶层声明不会泄漏到全局',
      'Node.js ESM',
      `// module.mjs
const secret = 'module-only';
export const publicValue = secret.toUpperCase();
console.log('inside', publicValue);
console.log('on globalThis', 'publicValue' in globalThis);

// 执行：node module.mjs`,
      `inside MODULE-ONLY
on globalThis false
模块导出形成公共边界，内部 const 不会自动成为 globalThis 属性。`,
    ),
  ],
  [jsName(j0Stage, '控制台、断点与 Source Map')]: [
    jsExample(
      '用请求 ID 串联结构化日志',
      'Node.js',
      `const requestId = 'req-42';
const started = performance.now();
console.info({ requestId, stage: 'validate', input: { tier: 'gold' } });
try {
  throw new RangeError('amount must be finite');
} catch (error) {
  console.error({ requestId, stage: 'calculate', code: error.name, message: error.message });
} finally {
  console.log({ requestId, stage: 'finish', durationMs: Math.round(performance.now() - started) });
}`,
      `{ requestId: 'req-42', stage: 'validate', input: { tier: 'gold' } }
{ requestId: 'req-42', stage: 'calculate', code: 'RangeError', message: 'amount must be finite' }
{ requestId: 'req-42', stage: 'finish', durationMs: 0 }`,
    ),
    jsExample(
      '在真实执行行暂停并查看局部变量',
      'Node.js Inspector',
      `function total(lines) {
  let sum = 0;
  for (const [index, line] of lines.entries()) {
    debugger;
    sum += line.price * line.qty;
    console.log('breakpoint seen', index, sum);
  }
  return sum;
}
total([{ price: 10, qty: 2 }, { price: 3, qty: 4 }]);

// 执行：node inspect breakpoint.mjs`,
      `break in breakpoint.mjs:5
3   sum += line.price * line.qty;
debug> exec("sum")
0
breakpoint seen 0 20`,
    ),
    jsExample(
      '构建并核对 Source Map 与产物',
      'Vite + PowerShell',
      `// vite.config.js
import { defineConfig } from 'vite';
export default defineConfig({ build: { sourcemap: true } });

// 验证
pnpm build
Get-ChildItem dist/assets -Filter '*.map' | Select-Object Name,Length
Select-String -Path dist/assets/*.js -Pattern 'sourceMappingURL'`,
      `index-D3f91a.js.map  48210
index-D3f91a.js: sourceMappingURL=index-D3f91a.js.map
浏览器 Sources 可还原 original.js，映射文件名与构建哈希一致。`,
    ),
    jsExample(
      '保留异步错误的 cause 与业务阶段',
      'Node.js',
      `async function loadOrders() {
  try {
    await fetch('http://127.0.0.1:1/orders');
  } catch (error) {
    throw new Error('order-sync: network request failed', {
      cause: error,
    });
  }
}
loadOrders().catch((error) => {
  console.log('message', error.message);
  console.log('cause', error.cause?.name);
  console.log('stack has stage', error.stack.includes('order-sync'));
});`,
      `message order-sync: network request failed
cause TypeError
stack has stage true`,
    ),
    jsExample(
      '用条件日志缩小循环故障输入',
      'Node.js',
      `const users = [
  { id: 'u-41', score: 75 },
  { id: 'u-42', score: Number.NaN },
  { id: 'u-43', score: 90 },
];
for (const user of users) {
  const failing = user.id === 'u-42';
  if (failing) console.log('condition hit', user.id, user.score);
  const normalized = Number.isFinite(user.score) ? user.score : 0;
  console.log(user.id, normalized);
}`,
      `u-41 75
condition hit u-42 NaN
u-42 0
u-43 90`,
    ),
  ],
  [jsName(j0Stage, '第一段可测试 JavaScript 程序')]: [
    jsExample(
      '先把金额输入契约写成断言',
      'Node.js test',
      `import assert from 'node:assert/strict';

function parseAmount(value) {
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number < 0) throw new RangeError('invalid amount');
  return number;
}

assert.equal(parseAmount(' 12.50 '), 12.5);
assert.throws(() => parseAmount('abc'), RangeError);
assert.throws(() => parseAmount(-1), RangeError);
console.log('contract samples passed');`,
      `contract samples passed
覆盖数字字符串、NaN 和负数三类输入，并固定返回 number 的契约。`,
    ),
    jsExample(
      '纯函数连续调用返回相同结果',
      'Node.js',
      `function calculate(lines) {
  const subtotal = lines.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = subtotal >= 100 ? 20 : 0;
  return { subtotal, discount, total: subtotal - discount };
}
const input = Object.freeze([{ price: 60, qty: 2 }]);
const first = calculate(input);
const second = calculate(input);
console.log(first);
console.log('same result', JSON.stringify(first) === JSON.stringify(second));`,
      `{ subtotal: 120, discount: 20, total: 100 }
same result true`,
    ),
    jsExample(
      '浏览器适配层只解析输入和渲染结果',
      'Browser JavaScript',
      `import { calculate } from './lib/cart.js';

const form = document.querySelector('#cart-form');
const output = document.querySelector('#total');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    const lines = JSON.parse(String(data.get('lines') ?? '[]'));
    output.textContent = calculate(lines).total.toFixed(2);
  } catch (error) {
    output.textContent = '输入格式错误: ' + error.message;
  }
});`,
      `提交 [{"price":60,"qty":2}] 后页面显示 100.00
输入 {bad json 后显示“输入格式错误”，业务纯函数文件未引用 document。`,
    ),
    jsExample(
      'Vitest 同时锁定成功值与失败类型',
      'Vitest',
      `import { describe, expect, it } from 'vitest';
import { calculate, parseAmount } from '../src/lib/cart.js';

describe('cart contract', () => {
  it('sums an empty cart', () => {
    expect(calculate([])).toEqual({ subtotal: 0, discount: 0, total: 0 });
  });
  it('rejects a non-number amount', () => {
    expect(() => parseAmount('abc')).toThrow(RangeError);
  });
});

// 执行：pnpm exec vitest run src/lib/cart.test.js`,
      `✓ cart contract > sums an empty cart
✓ cart contract > rejects a non-number amount
Test Files  1 passed (1)
Tests       2 passed (2)`,
    ),
    jsExample(
      '从测试到构建与运行说明一次收口',
      'PowerShell',
      `pnpm exec vitest run
pnpm build
node scripts/smoke.mjs fixtures/empty.json
node scripts/smoke.mjs fixtures/invalid.json
$afterFailure = $LASTEXITCODE
Write-Output "invalid-exit=$afterFailure"`,
      `Tests  4 passed (4)
vite v7.2.2 building for production...
built in 842ms
smoke total=0.00
invalid input: amount must be finite
invalid-exit=1`,
    ),
  ],
  [jsName(j1Stage, '原始值、对象与隐式转换')]: [
    jsExample(
      '区分 Object.is 与严格相等',
      'Node.js',
      `const pairs = [
  [NaN, NaN],
  [0, -0],
  ['1', 1],
];
for (const [left, right] of pairs) {
  console.log(String(left), String(right), {
    strict: left === right,
    sameValue: Object.is(left, right),
  });
}`,
      `NaN NaN { strict: false, sameValue: true }
0 0 { strict: true, sameValue: false }
1 1 { strict: false, sameValue: false }`,
    ),
    jsExample(
      '观察原始值临时装箱',
      'Node.js',
      `const primitive = 'javascript';
const boxed = Object(primitive);
console.log('typeof primitive', typeof primitive);
console.log('typeof boxed', typeof boxed);
console.log('length', primitive.length, boxed.length);
boxed.extra = 'temporary';
console.log('boxed retains property', boxed.extra);
console.log('primitive property', primitive.extra);`,
      `typeof primitive string
typeof boxed object
length 10 10
boxed retains property temporary
primitive property undefined`,
    ),
    jsExample(
      '自定义 Symbol.toPrimitive 决定转换结果',
      'Node.js',
      `class Money {
  constructor(cents) { this.cents = cents; }
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') return this.cents / 100;
    if (hint === 'string') return '$' + (this.cents / 100).toFixed(2);
    return this.cents;
  }
}
const price = new Money(1250);
console.log('default', +price);
console.log('text', String(price));
console.log('plus', price + 50);`,
      `default 12.5
text $12.50
plus 1300`,
    ),
    jsExample(
      '输入先归一化再做业务比较',
      'Node.js',
      `function normalizeStatus(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) throw new TypeError('status required');
  return value;
}
const rows = [[200, '200'], [0, 0], ['paid', ' PAID '], [null, undefined]];
for (const [left, right] of rows) {
  try {
    const same = normalizeStatus(left) === normalizeStatus(right);
    console.log(String(left), String(right), same);
  } catch (error) {
    console.log(String(left), String(right), error.message);
  }
}`,
      `200 200 true
0 0 true
paid  PAID  true
null undefined status required`,
    ),
    jsExample(
      '数量解析拒绝不完整数字和安全整数越界',
      'Node.js',
      `function parseQuantity(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    throw new TypeError('quantity must be string or number');
  }
  const text = String(input).trim();
  if (!/^-?\\d+$/.test(text)) throw new RangeError('integer required');
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('out of range');
  return value;
}
for (const value of ['3', '1abc', '9007199254740992', 0, ' 4 ']) {
  try { console.log(value, '->', parseQuantity(value)); }
  catch (error) { console.log(value, '->', error.message); }
}`,
      `3 -> 3
1abc -> integer required
9007199254740992 -> out of range
0 -> out of range
 4  -> 4`,
    ),
  ],
  [jsName(j1Stage, 'let、const、提升与暂时性死区')]: [
    jsExample(
      '声明初始化之间是暂时性死区',
      'Node.js',
      `function load(config) {
  if (config.enabled) {
    try {
      console.log(level);
    } catch (error) {
      console.log(error.name, error.message);
    }
  }
  const level = config.level ?? 'info';
  return level;
}
console.log(load({ enabled: true, level: 'debug' }));`,
      `ReferenceError Cannot access 'level' before initialization
debug`,
    ),
    jsExample(
      '块级作用域阻止循环变量泄漏',
      'Node.js',
      `let last = null;
for (let index = 0; index < 3; index += 1) {
  const label = 'row-' + index;
  last = label;
}
console.log('last', last);
try {
  console.log(index);
} catch (error) {
  console.log('outside loop', error.name);
}
try {
  console.log(label);
} catch (error) {
  console.log('outside block', error.name);
}`,
      `last row-2
outside loop ReferenceError
outside block ReferenceError`,
    ),
    jsExample(
      'const 数组仍可能被原地修改',
      'Node.js',
      `const queue = ['created'];
queue.push('paid');
queue[0] = 'pending';
console.log('contents', queue);
try {
  queue = ['reset'];
} catch (error) {
  console.log('rebind', error.name);
}
const frozen = Object.freeze(['created']);
try {
  frozen.push('paid');
} catch (error) {
  console.log('frozen push', error.name);
}`,
      `contents [ 'pending', 'paid' ]
rebind TypeError
frozen push TypeError`,
    ),
    jsExample(
      '循环闭包只捕获本轮 let 绑定',
      'Node.js',
      `const runnable = [];
for (let index = 0; index < 3; index += 1) {
  runnable.push(() => 'item-' + index);
}
console.log(runnable.map((run) => run()));

const broken = [];
for (var legacyIndex = 0; legacyIndex < 3; legacyIndex += 1) {
  broken.push(() => 'legacy-' + legacyIndex);
}
console.log(broken.map((run) => run()));`,
      `[ 'item-0', 'item-1', 'item-2' ]
[ 'legacy-3', 'legacy-3', 'legacy-3' ]`,
    ),
    jsExample(
      '依赖顺序由代码结构表达',
      'ESLint + Node.js',
      `// .eslintrc.cjs
module.exports = {
  root: true,
  env: { es2024: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'no-use-before-define': ['error', { functions: false }] },
};

// 执行
pnpm exec eslint src/config.js
node --check src/config.js`,
      `src/config.js
  3:11 error 'timeout' was used before it was defined no-use-before-define
✖ 1 problem (1 error, 0 warnings)`,
    ),
  ],
  [jsName(j1Stage, '闭包、工厂函数与私有状态')]: [
    jsExample(
      '闭包保存计数器的私有绑定',
      'Node.js',
      `function createCounter(start = 0) {
  let value = start;
  return {
    increment(step = 1) { value += step; return value; },
    read() { return value; },
  };
}
const first = createCounter();
const second = createCounter(10);
first.increment();
first.increment(2);
second.increment();
console.log(first.read(), second.read());`,
      `3 11
两个实例各自持有独立的 value 绑定，外部无法直接写入。`,
    ),
    jsExample(
      '工厂函数只暴露公开行为',
      'Node.js',
      `function createInventory(initial = []) {
  const rows = structuredClone(initial);
  return Object.freeze({
    available(sku) {
      return rows.find((row) => row.sku === sku)?.qty ?? 0;
    },
    reserve(sku, qty) {
      const row = rows.find((item) => item.sku === sku);
      if (!row || row.qty < qty) throw new RangeError('insufficient stock');
      row.qty -= qty;
      return row.qty;
    },
  });
}
const stock = createInventory([{ sku: 'A', qty: 5 }]);
console.log(stock.reserve('A', 2), stock.available('A'));
console.log('rows visible', Object.hasOwn(stock, 'rows'));`,
      `3 3
rows visible false
库存数组被闭包持有，调用方只能通过可用量与预留行为操作它。`,
    ),
    jsExample(
      '模块级共享状态不能冒充实例状态',
      'Node.js ESM · 双文件',
      `// cache.mjs
const values = new Map();
export const get = (key) => values.get(key);
export const set = (key, value) => values.set(key, value);
export const size = () => values.size;

// app.mjs
import * as cache from './cache.mjs';
cache.set('tenant-a:1', 10);
cache.set('tenant-b:1', 20);
console.log(cache.size(), cache.get('tenant-a:1'));
// 多租户实例需要把 Map 放进工厂，避免跨实例共享。`,
      `2 10
当前模块只有一个 Map；再次 import 得到同一缓存，不会自动按租户隔离。`,
    ),
    jsExample(
      '启动和停止由同一个闭包管理',
      'Node.js',
      `function createTicker(onTick, intervalMs = 100) {
  let timer = null;
  return {
    start() {
      if (timer) return false;
      timer = setInterval(onTick, intervalMs);
      return true;
    },
    stop() {
      if (!timer) return false;
      clearInterval(timer);
      timer = null;
      return true;
    },
  };
}
const ticker = createTicker(() => console.log('tick'));
console.log(ticker.start(), ticker.start());
console.log(ticker.stop(), ticker.stop());`,
      `true false
true false
第二次 start 或 stop 返回 false，重复清理不会改变已经结束的生命周期。`,
    ),
    jsExample(
      '测试证明闭包实例不会串状态',
      'Vitest',
      `import { describe, expect, it } from 'vitest';
import { createCounter } from './counter.js';

describe('createCounter', () => {
  it('keeps instances isolated', () => {
    const left = createCounter();
    const right = createCounter(10);
    left.increment();
    expect(left.read()).toBe(1);
    expect(right.read()).toBe(10);
  });
  it('does not expose mutable storage', () => {
    expect(Object.keys(createCounter())).toEqual(['increment', 'read']);
  });
});`,
      `✓ createCounter > keeps instances isolated
✓ createCounter > does not expose mutable storage
Tests  2 passed (2)`,
    ),
  ],
  [jsName(j1Stage, '解构、展开、可选链与空值合并')]: [
    jsExample(
      '解构默认值只处理 undefined',
      'Node.js',
      `function label(input) {
  const { name = '匿名', note = '无备注' } = input;
  return { name, note };
}
console.log(label({ name: null, note: '' }));
console.log(label({}));
console.log(label({ name: 0, note: false }));`,
      `{ name: null, note: '' }
{ name: '匿名', note: '无备注' }
{ name: 0, note: false }`,
    ),
    jsExample(
      '数组解构保留位置语义',
      'Node.js',
      `const rows = [
  ['2026-11-24', 'paid', 120],
  ['2026-11-25', 'pending', 80],
];
for (const [date, status, amount] of rows) {
  const [, , cents] = [date, status, amount * 100];
  console.log({ date, status, cents });
}
const [first, ...rest] = rows;
console.log('first status', first[1], 'remaining', rest.length);`,
      `{ date: '2026-11-24', status: 'paid', cents: 12000 }
{ date: '2026-11-25', status: 'pending', cents: 8000 }
first status paid remaining 1`,
    ),
    jsExample(
      '展开只复制当前一层',
      'Node.js',
      `const original = {
  id: 'u-1',
  profile: { name: 'Ada', tags: ['math'] },
};
const copy = { ...original, profile: { ...original.profile } };
copy.id = 'u-2';
copy.profile.name = 'Grace';
copy.profile.tags.push('computing');
console.log('copy id', copy.id);
console.log('original', original);`,
      `copy id u-2
original {
  id: 'u-1',
  profile: { name: 'Grace', tags: [ 'math', 'computing' ] }
}`,
    ),
    jsExample(
      '可选链不会把业务空值变成成功',
      'Node.js',
      `const orders = [
  { id: 'A', customer: { email: 'ada@example.test' } },
  { id: 'B', customer: null },
  { id: 'C' },
];
for (const order of orders) {
  const email = order.customer?.email;
  const display = email?.trim() || '未提供邮箱';
  console.log(order.id, display);
}`,
      `A ada@example.test
B 未提供邮箱
C 未提供邮箱`,
    ),
    jsExample(
      '空值合并保留合法的空字符串与零',
      'Node.js',
      `function renderPreference(input) {
  return {
    theme: input.theme ?? 'light',
    density: input.density ?? 'comfortable',
    signature: input.signature ?? '未设置',
    retries: input.retries ?? 0,
  };
}
console.log(renderPreference({ theme: '', density: null, signature: undefined, retries: 0 }));
console.log(renderPreference({ theme: 'dark', density: 'compact', signature: 'Ada', retries: 3 }));`,
      `{ theme: '', density: 'comfortable', signature: '未设置', retries: 0 }
{ theme: 'dark', density: 'compact', signature: 'Ada', retries: 3 }`,
    ),
  ],
  [jsName(j1Stage, '浅拷贝、深拷贝与结构化克隆')]: [
    jsExample(
      '浅拷贝共享嵌套对象',
      'Node.js',
      `const state = { user: { name: 'Ada' }, roles: ['admin'] };
const shallow = { ...state };
shallow.user.name = 'Grace';
shallow.roles.push('auditor');
console.log('same user', shallow.user === state.user);
console.log('same roles', shallow.roles === state.roles);
console.log(state);`,
      `same user true
same roles true
{ user: { name: 'Grace' }, roles: [ 'admin', 'auditor' ] }`,
    ),
    jsExample(
      'JSON 往返丢失日期 Map 和 undefined',
      'Node.js',
      `const source = {
  date: new Date('2026-11-24T00:00:00Z'),
  map: new Map([['gold', 0.8]]),
  missing: undefined,
  count: 3,
};
const restored = JSON.parse(JSON.stringify(source));
console.log(restored);
console.log('date type', typeof restored.date);
console.log('map type', Object.prototype.toString.call(restored.map));
console.log('missing present', Object.hasOwn(restored, 'missing'));`,
      `{ date: '2026-11-24T00:00:00.000Z', map: {}, count: 3 }
date type string
map type [object Object]
missing present false`,
    ),
    jsExample(
      'structuredClone 保留日期 Map 与循环引用',
      'Node.js',
      `const source = { date: new Date('2026-11-24T00:00:00Z') };
source.rates = new Map([['gold', 0.8]]);
source.self = source;
const copy = structuredClone(source);
console.log(copy.date instanceof Date);
console.log(copy.rates.get('gold'));
console.log('cycle cloned', copy.self === copy);
console.log('root distinct', copy !== source);`,
      `true
0.8
cycle cloned true
root distinct true`,
    ),
    jsExample(
      '克隆数据不会复制原型方法',
      'Node.js',
      `class Session {
  constructor(id) { this.id = id; }
  describe() { return 'session:' + this.id; }
}
const original = new Session('s-1');
const copied = structuredClone(original);
console.log(copied.id);
console.log(copied instanceof Session);
console.log('method', typeof copied.describe);
console.log('original method', original.describe());`,
      `s-1
false
method undefined
original method session:s-1`,
    ),
    jsExample(
      '按数据风险选择克隆策略',
      'Node.js',
      `function cloneForUpdate(input) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('object required');
  }
  if (input instanceof Date || input instanceof Map) {
    return structuredClone(input);
  }
  return { ...input, meta: structuredClone(input.meta ?? {}) };
}
const row = { id: 1, meta: { tags: ['gold'] } };
const editable = cloneForUpdate(row);
editable.meta.tags.push('vip');
console.log('source tags', row.meta.tags);
console.log('copy tags', editable.meta.tags);`,
      `source tags [ 'gold' ]
copy tags [ 'gold', 'vip' ]`,
    ),
  ],
  [jsName(j1Stage, '作用域和闭包缺陷实验')]: [
    jsExample(
      '先记录回调实际执行时间',
      'Node.js',
      `const events = [];
for (var index = 0; index < 3; index += 1) {
  setTimeout(() => events.push('timer-' + index), 0);
  events.push('sync-' + index);
}
setTimeout(() => console.log(events), 10);

// 执行：node timer-scope.mjs`,
      `[
  'sync-0',
  'sync-1',
  'sync-2',
  'timer-3',
  'timer-3',
  'timer-3'
]`,
    ),
    jsExample(
      'let 为每个回调创建独立绑定',
      'Node.js',
      `const events = [];
for (let index = 0; index < 3; index += 1) {
  setTimeout(() => events.push({ index, phase: 'timer' }), 0);
}
setTimeout(() => {
  console.log(events);
  console.log('unique indexes', new Set(events.map((item) => item.index)).size);
}, 10);`,
      `[ { index: 0, phase: 'timer' },
  { index: 1, phase: 'timer' },
  { index: 2, phase: 'timer' } ]
unique indexes 3`,
    ),
    jsExample(
      '把共享状态收进显式接口',
      'JavaScript',
      `function createAuditLog(limit = 3) {
  const rows = [];
  return {
    add(event) {
      rows.push({ ...event, at: rowClock++ });
      if (rows.length > limit) rows.shift();
    },
    snapshot() { return rows.map((row) => ({ ...row })); },
  };
}
let rowClock = 0;
const audit = createAuditLog(2);
audit.add({ type: 'login' });
audit.add({ type: 'view' });
audit.add({ type: 'logout' });
console.log(audit.snapshot());`,
      `[ { type: 'view', at: 1 }, { type: 'logout', at: 2 } ]
外部只能通过 add 和 snapshot 操作内部数组，容量上限也有单一归属。`,
    ),
    jsExample(
      '监听器和定时器都能被重复安全清理',
      'Node.js',
      `const target = new EventTarget();
let count = 0;
const handler = () => { count += 1; };
target.addEventListener('change', handler);
target.dispatchEvent(new Event('change'));
target.removeEventListener('change', handler);
target.removeEventListener('change', handler);
target.dispatchEvent(new Event('change'));
console.log('handler calls', count);

const controller = new AbortController();
setTimeout(() => controller.abort(), 5);
controller.signal.addEventListener('abort', () => console.log('aborted once'));
setTimeout(() => controller.abort(), 10);`,
      `handler calls 1
aborted once
移除不存在的监听器不会报错，重复 abort 也不会再次触发一次性事件。`,
    ),
    jsExample(
      '把闭包缺陷固化为回归测试',
      'Vitest',
      `import { describe, expect, it } from 'vitest';

function schedule(indexes, push, later) {
  for (let index of indexes) later(() => push(index));
}

describe('closure regression', () => {
  it('keeps every callback index', () => {
    const seen = [];
    const queue = [];
    schedule([0, 1, 2], (value) => seen.push(value), (run) => queue.push(run));
    queue.forEach((run) => run());
    expect(seen).toEqual([0, 1, 2]);
  });
});`,
      `✓ closure regression > keeps every callback index
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
  ],
  [jsName(j2Stage, '对象属性、描述符与原型链')]: [
    jsExample(
      '区分自有属性与原型继承属性',
      'Node.js',
      `const base = { kind: 'base', inherited: true };
const row = Object.create(base);
row.id = 'u-1';
console.log('own id', Object.hasOwn(row, 'id'));
console.log('own inherited', Object.hasOwn(row, 'inherited'));
console.log('in operator', 'inherited' in row);
console.log(Object.keys(row));`,
      `own id true
own inherited false
in operator true
[ 'id' ]`,
    ),
    jsExample(
      '数据描述符控制可写枚举与配置',
      'Node.js',
      `const record = {};
Object.defineProperty(record, 'id', {
  value: 'u-42',
  writable: false,
  enumerable: true,
  configurable: false,
});
console.log(record.id);
try {
  record.id = 'u-99';
} catch (error) {
  console.log(error.name);
}
console.log(record.id);
console.log(Object.keys(record));
console.log(Object.getOwnPropertyDescriptor(record, 'id'));`,
      `u-42
TypeError
u-42
[ 'id' ]
{ value: 'u-42', writable: false, enumerable: true, configurable: false }`,
    ),
    jsExample(
      '访问器在读取时计算并校验写入',
      'Node.js',
      `class Temperature {
  #celsius = 0;
  get celsius() { return this.#celsius; }
  set celsius(value) {
    if (!Number.isFinite(value)) throw new TypeError('number required');
    this.#celsius = value;
  }
  get fahrenheit() { return this.#celsius * 9 / 5 + 32; }
}
const temperature = new Temperature();
temperature.celsius = 25;
console.log(temperature.fahrenheit);
try { temperature.celsius = 'hot'; }
catch (error) { console.log(error.name, error.message); }`,
      `77
TypeError number required
访问器把内部存储留在私有字段，非法写入不会改变摄氏温度。`,
    ),
    jsExample(
      '原型共享方法但实例数据独立',
      'Node.js',
      `function Order(id, amount) {
  this.id = id;
  this.amount = amount;
}
Order.prototype.describe = function describe() {
  return this.id + ':' + this.amount;
};
const first = new Order('A', 100);
const second = new Order('B', 80);
console.log(first.describe(), second.describe());
console.log('shared method', first.describe === second.describe);
console.log('own amount', Object.hasOwn(first, 'amount'));`,
      `A:100 B:80
shared method true
own amount true`,
    ),
    jsExample(
      '沿原型链检查构造关系',
      'Node.js',
      `class Entity {}
class Customer extends Entity {
  constructor(id) { super(); this.id = id; }
}
const customer = new Customer('c-1');
const chain = [];
for (let cursor = customer; cursor; cursor = Object.getPrototypeOf(cursor)) {
  chain.push(cursor.constructor?.name ?? '(null prototype)');
}
console.log(chain);
console.log(customer instanceof Customer, customer instanceof Entity);`,
      `[ 'Customer', 'Entity', '(null prototype)' ]
true true`,
    ),
  ],
  [jsName(j2Stage, '构造函数、class 与实例方法')]: [
    jsExample(
      '观察 new 如何创建并绑定实例',
      'Node.js',
      `function Account(id, balance) {
  this.id = id;
  this.balance = balance;
  this.created = true;
}
const account = new Account('a-1', 50);
console.log(account);
console.log(account instanceof Account);
console.log(Object.getPrototypeOf(account) === Account.prototype);
console.log(Account('bad', 10));`,
      `{ id: 'a-1', balance: 50, created: true }
true
true
undefined`,
    ),
    jsExample(
      'class 方法共享字段按实例创建',
      'Node.js',
      `class Cart {
  items = [];
  add(sku, qty) {
    this.items.push({ sku, qty });
  }
  total() {
    return this.items.reduce((sum, item) => sum + item.qty, 0);
  }
}
const left = new Cart();
const right = new Cart();
left.add('A', 2);
right.add('B', 3);
console.log(left.total(), right.total());
console.log(left.add === right.add);`,
      `2 3
true
两个 Cart 各自持有 items，而 add 方法由同一个原型提供。`,
    ),
    jsExample(
      '构造器维护余额不变式',
      'Node.js',
      `class Wallet {
  #balance;
  constructor(initial) {
    if (!Number.isSafeInteger(initial) || initial < 0) {
      throw new RangeError('balance must be a non-negative integer');
    }
    this.#balance = initial;
  }
  deposit(cents) {
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError('bad deposit');
    this.#balance += cents;
    return this.#balance;
  }
  get balance() { return this.#balance; }
}
console.log(new Wallet(100).deposit(50));
try { new Wallet(-1); } catch (error) { console.log(error.name, error.message); }`,
      `150
RangeError balance must be a non-negative integer`,
    ),
    jsExample(
      '方法脱离接收者后不能读取实例',
      'Node.js',
      `class Session {
  constructor(userId) { this.userId = userId; }
  describe() { return 'user=' + this.userId; }
}
const session = new Session('u-7');
const fn = session.describe;
console.log(session.describe());
try {
  console.log(fn());
} catch (error) {
  console.log(error.name, error.message);
}`,
      `user=u-7
TypeError Cannot read properties of undefined (reading 'userId')`,
    ),
    jsExample(
      '实例测试同时验证原型与业务约束',
      'Vitest',
      `import { describe, expect, it } from 'vitest';
import { Wallet } from './wallet.js';

describe('Wallet', () => {
  it('creates an instance with the expected prototype', () => {
    const wallet = new Wallet(100);
    expect(wallet).toBeInstanceOf(Wallet);
    expect(Object.hasOwn(wallet, 'balance')).toBe(false);
  });
  it('rejects an invalid opening balance', () => {
    expect(() => new Wallet(-1)).toThrowError(/non-negative/);
  });
});`,
      `✓ Wallet > creates an instance with the expected prototype
✓ Wallet > rejects an invalid opening balance
Tests  2 passed (2)`,
    ),
  ],
  [jsName(j2Stage, 'this、call、apply 与 bind')]: [
    jsExample(
      '普通函数的 this 由调用点决定',
      'Node.js',
      `'use strict';
function describe() {
  return { thisType: typeof this, id: this?.id ?? null };
}
const order = { id: 'o-1', describe };
console.log(order.describe());
console.log(describe());
console.log(describe.call({ id: 'o-2' }));`,
      `{ thisType: 'object', id: 'o-1' }
{ thisType: 'undefined', id: null }
{ thisType: 'object', id: 'o-2' }`,
    ),
    jsExample(
      'call 与 apply 显式传入接收者和参数',
      'Node.js',
      `function quote(currency, taxRate) {
  return this.base * (1 + taxRate) + ' ' + currency;
}
const order = { base: 100 };
console.log(quote.call(order, 'CNY', 0.06));
const args = ['USD', 0.08];
console.log(quote.apply(order, args));
console.log(quote.bind(order, 'EUR')(0.2));`,
      `106 CNY
108 USD
120 EUR
call 接受展开参数，apply 接受数组，bind 返回可稍后调用的新函数。`,
    ),
    jsExample(
      'bind 返回新的绑定函数对象',
      'Node.js',
      `function identity() {
  return this.id;
}
const source = { id: 'source' };
const bound = identity.bind(source);
const rebound = bound.bind({ id: 'other' });
console.log(identity.name, bound.name);
console.log(bound());
console.log(rebound());
console.log(bound === rebound);`,
      `identity bound identity
source
source
false`,
    ),
    jsExample(
      '传递回调时同时固定接收者',
      'Node.js',
      `class Cart {
  constructor() { this.items = []; }
  add(sku) { this.items.push(sku); }
  snapshot() { return this.items.join(','); }
}
const cart = new Cart();
const actions = ['A', 'B'];
actions.forEach(cart.add, cart);
console.log(cart.snapshot());
const later = cart.add.bind(cart);
later('C');
console.log(cart.snapshot());`,
      `A,B
A,B,C
forEach 的第二个参数固定接收者，绑定后的回调也能在异步阶段继续使用。`,
    ),
    jsExample(
      '严格模式暴露丢失的接收者',
      'Node.js',
      `'use strict';
class Counter {
  constructor() { this.value = 0; }
  increment() { this.value += 1; return this.value; }
}
const counter = new Counter();
const detached = counter.increment;
try {
  detached();
} catch (error) {
  console.log(error.name);
}
console.log('safe', counter.increment());`,
      `TypeError
safe 1
丢失接收者的调用立即失败，显式通过实例调用仍能正常维护状态。`,
    ),
  ],
  [jsName(j2Stage, '箭头函数与回调上下文')]: [
    jsExample(
      '箭头函数从定义位置捕获 this',
      'Node.js',
      `const timer = {
  seconds: 2,
  start() {
    return setTimeout(() => {
      console.log('arrow this seconds', this.seconds);
    }, 0);
  },
  startBroken() {
    return setTimeout(function () {
      console.log('plain this seconds', this?.seconds);
    }, 0);
  },
};
const handle = timer.start();
timer.startBroken();
clearTimeout(handle);`,
      `plain this seconds undefined
arrow this seconds 2`,
    ),
    jsExample(
      '箭头函数没有独立 arguments 与 prototype',
      'Node.js',
      `const regular = function regular(a, b) {
  return arguments.length;
};
const arrow = (...values) => values.length;
console.log('regular', regular(1, 2, 3));
console.log('arrow rest', arrow(1, 2, 3));
console.log('arrow prototype', Object.hasOwn(arrow, 'prototype'));
try { new arrow(); } catch (error) { console.log(error.name); }`,
      `regular 3
arrow rest 3
arrow prototype false
TypeError`,
    ),
    jsExample(
      '数组回调只保留表达式结果',
      'Node.js',
      `const rows = [
  { sku: 'A', amount: 100, active: true },
  { sku: 'B', amount: 80, active: false },
  { sku: 'C', amount: 120, active: true },
];
const activeTotal = rows
  .filter((row) => row.active)
  .map((row) => ({ ...row, tax: Math.round(row.amount * 0.06) }))
  .reduce((sum, row) => sum + row.amount + row.tax, 0);
console.log('total', activeTotal);
console.log('active', rows.filter((row) => row.active).map((row) => row.sku));`,
      `total 236
active [ 'A', 'C' ]
中间 map 创建新对象，没有修改原始订单行；最终汇总结果可重复计算。`,
    ),
    jsExample(
      '类字段箭头回调可以被准确移除',
      'Browser JavaScript',
      `class SearchBox {
  query = '';
  handleInput = (event) => {
    this.query = event.target.value.trim();
    console.log('query', this.query);
  };
  connect(input) {
    input.addEventListener('input', this.handleInput);
  }
  disconnect(input) {
    input.removeEventListener('input', this.handleInput);
  }
}
const input = document.querySelector('#search');
const box = new SearchBox();
box.connect(input);
input.value = '  ada  ';
box.handleInput({ target: input });
box.disconnect(input);
console.log('connected after disconnect', false);`,
      `query ada
connected after disconnect false`,
    ),
    jsExample(
      '动态调用上下文进入单元测试',
      'Vitest',
      `import { describe, expect, it } from 'vitest';

const service = {
  prefix: 'ID',
  format(value) { return this.prefix + '-' + value; },
};

describe('method receiver', () => {
  it('uses an explicit object', () => {
    expect(service.format.call({ prefix: 'EXT' }, 7)).toBe('EXT-7');
  });
  it('keeps a bound callback stable', () => {
    const format = service.format.bind(service);
    expect(format(8)).toBe('ID-8');
  });
});`,
      `✓ method receiver > uses an explicit object
✓ method receiver > keeps a bound callback stable
Tests  2 passed (2)`,
    ),
  ],
  [jsName(j2Stage, '组合、委托与继承取舍')]: [
    jsExample(
      '先验证继承是否真的表达 is-a',
      'Node.js',
      `class Account {
  constructor(id) { this.id = id; }
  close() { return 'closed:' + this.id; }
}
class AuditEvent extends Account {}
const event = new AuditEvent('event-1');
console.log(event.close());
console.log('audit event is account', event instanceof Account);
console.log('problem: event now inherits account lifecycle methods');`,
      `closed:event-1
audit event is account true
problem: event now inherits account lifecycle methods`,
    ),
    jsExample(
      '委托复用行为但保持对象身份独立',
      'Node.js',
      `const formatter = {
  money(cents) { return (cents / 100).toFixed(2); },
};
function invoice(id, cents) {
  return {
    id,
    cents,
    format() { return id + ': ' + formatter.money(cents); },
  };
}
const first = invoice('I-1', 1299);
const second = invoice('I-2', 500);
console.log(first.format(), second.format());
console.log('no instance inheritance', Object.getPrototypeOf(first) === Object.prototype);`,
      `I-1: 12.99 I-2: 5.00
no instance inheritance true`,
    ),
    jsExample(
      '组合把可替换依赖留在边界',
      'Node.js',
      `function createNotifier(channel) {
  if (typeof channel.send !== 'function') throw new TypeError('send required');
  return {
    notify(user, message) {
      if (!user.email) return { delivered: false, reason: 'missing-email' };
      channel.send(user.email, message);
      return { delivered: true, reason: null };
    },
  };
}
const calls = [];
const notifier = createNotifier({ send: (to, text) => calls.push({ to, text }) });
console.log(notifier.notify({ email: 'ada@example.test' }, 'welcome'));
console.log(calls);`,
      `{ delivered: true, reason: null }
[ { to: 'ada@example.test', text: 'welcome' } ]`,
    ),
    jsExample(
      '策略接口选择变化点而不是复制分支',
      'Node.js',
      `const pricing = {
  basic: (amount) => amount,
  gold: (amount) => amount >= 100 ? amount - 20 : amount,
};
function checkout(amount, tier) {
  const strategy = pricing[tier];
  if (!strategy) throw new RangeError('unsupported tier');
  return { amount, tier, payable: strategy(amount) };
}
console.log(checkout(80, 'gold'));
console.log(checkout(120, 'gold'));
try { checkout(120, 'vip'); } catch (error) { console.log(error.message); }`,
      `{ amount: 80, tier: 'gold', payable: 80 }
{ amount: 120, tier: 'gold', payable: 100 }
unsupported tier`,
    ),
    jsExample(
      '重构对象内部结构但冻结外部行为',
      'Node.js',
      `function makeLegacy() {
  return { value: 0, increment() { this.value += 1; return this.value; } };
}
const legacy = makeLegacy();
const before = [legacy.increment(), legacy.value];

function makeRefactored() {
  let value = 0;
  return Object.freeze({ increment() { value += 1; return value; } });
}
const refactored = makeRefactored();
const after = [refactored.increment(), refactored.increment()];
console.log('legacy', before);
console.log('refactored', after);`,
      `legacy [ 1, 1 ]
refactored [ 1, 2 ]
公开 increment 契约不变，内部状态从可枚举字段改为闭包。`,
    ),
  ],
  [jsName(j2Stage, '对象模型调试与重构')]: [
    jsExample(
      '先输出对象结构与属性来源',
      'Node.js',
      `const base = { kind: 'base' };
const row = Object.create(base);
row.id = 'r-1';
row.amount = 20;
for (const key of Reflect.ownKeys(row)) {
  console.log(key, Object.getOwnPropertyDescriptor(row, key));
}
console.log('prototype kind', Object.getPrototypeOf(row).kind);
console.log(JSON.stringify(row));`,
      `id { value: 'r-1', writable: true, enumerable: true, configurable: true }
amount { value: 20, writable: true, enumerable: true, configurable: true }
prototype kind base
{"id":"r-1","amount":20}`,
    ),
    jsExample(
      '代理记录共享引用的写入者',
      'Node.js',
      `const writes = [];
function traced(target, label) {
  return new Proxy(target, {
    set(object, key, value) {
      writes.push({ label, key: String(key), value });
      return Reflect.set(object, key, value);
    },
  });
}
const shared = { total: 0 };
const left = traced(shared, 'left');
const right = traced(shared, 'right');
left.total = 10;
right.total = 20;
console.log(shared);
console.log(writes);`,
      `{ total: 20 }
[ { label: 'left', key: 'total', value: 10 },
  { label: 'right', key: 'total', value: 20 } ]`,
    ),
    jsExample(
      '沿调用链定位 this 接收者',
      'Node.js',
      `const store = {
  id: 'store-1',
  read() { return this.id; },
};
function invoke(label, fn, receiver) {
  console.log('invoke', label, 'receiver', receiver?.id ?? 'none');
  return fn();
}
console.log(invoke('method', () => store.read(), store));
try {
  console.log(invoke('detached', store.read));
} catch (error) {
  console.log(error.name, 'at detached call');
}`,
      `invoke method receiver store-1
store-1
invoke detached receiver none
TypeError at detached call`,
    ),
    jsExample(
      '对象重构先保持可观察契约',
      'Node.js',
      `function legacyOrder(id, amount) {
  return { id, amount, label() { return this.id + ':' + this.amount; } };
}
function refactoredOrder(id, amount) {
  return Object.freeze({
    id,
    amount,
    label: () => id + ':' + amount,
  });
}
const oldValue = legacyOrder('A', 40);
const newValue = refactoredOrder('A', 40);
console.log(oldValue.label(), newValue.label());
console.log(newValue.id, newValue.amount);
console.log('label callable', typeof newValue.label);`,
      `A:40 A:40
A 40
label callable function`,
    ),
    jsExample(
      '对象图测试暴露跨实例耦合',
      'Vitest',
      `import { describe, expect, it } from 'vitest';
import { createSession } from './session.js';

describe('session object graph', () => {
  it('does not share mutable permissions', () => {
    const left = createSession('left');
    const right = createSession('right');
    left.permissions.add('write');
    expect(right.permissions.has('write')).toBe(false);
  });
  it('exposes only the documented methods', () => {
    const keys = Object.keys(createSession('x')).sort();
    expect(keys).toEqual(['close', 'permissions', 'user']);
  });
});`,
      `✓ session object graph > does not share mutable permissions
✓ session object graph > exposes only the documented methods
Tests  2 passed (2)`,
    ),
  ],
  [jsName(j3Stage, '调用栈、任务队列与微任务')]: [
    jsExample(
      '同步调用栈在任务切换前完成',
      'Node.js',
      `console.log('A:start');
function inner() { console.log('B:inner'); }
function outer() { console.log('C:outer-before'); inner(); console.log('D:outer-after'); }
outer();
console.log('E:end');`,
      `A:start
C:outer-before
B:inner
D:outer-after
E:end`,
    ),
    jsExample(
      '微任务在当前任务末尾连续排空',
      'Node.js',
      `console.log('sync-1');
queueMicrotask(() => {
  console.log('micro-1');
  queueMicrotask(() => console.log('micro-2'));
});
Promise.resolve().then(() => console.log('promise-1'));
console.log('sync-2');`,
      `sync-1
sync-2
micro-1
promise-1
micro-2`,
    ),
    jsExample(
      '零毫秒定时器仍要等待任务队列',
      'Node.js',
      `console.log('start');
setTimeout(() => console.log('timeout-0'), 0);
setTimeout(() => console.log('timeout-5'), 5);
Promise.resolve().then(() => console.log('microtask'));
console.log('end');`,
      `start
end
microtask
timeout-0
timeout-5`,
    ),
    jsExample(
      '浏览器用 rAF 观察渲染机会',
      'Browser JavaScript',
      `const events = [];
requestAnimationFrame((time) => {
  events.push('raf-' + Math.round(time));
  setTimeout(() => {
    events.push('timer-after-raf');
    console.log(events.sort());
  }, 0);
});
Promise.resolve().then(() => events.push('micro-before-raf'));
console.log('scheduled');`,
      `scheduled
[ 'micro-before-raf', 'raf-4821', 'timer-after-raf' ]
rAF 回调在下一次绘制前执行，微任务仍在当前任务末尾排空。`,
    ),
    jsExample(
      '把事件循环顺序记录成可比较时间线',
      'Node.js',
      `const timeline = [];
const mark = (name) => timeline.push({ name, at: performance.now() });
Promise.resolve().then(() => mark('promise'));
setTimeout(() => {
  mark('timer');
  Promise.resolve().then(() => {
    mark('micro-after-timer');
    console.table(timeline.map((item, index) => ({ index, ...item })));
  });
}, 0);
mark('sync');`,
      `(index) │ name              │ at
0       │ sync              │ 4.12
1       │ promise           │ 5.03
2       │ timer             │ 6.88
3       │ micro-after-timer │ 7.21`,
    ),
  ],
  [jsName(j3Stage, 'Promise 状态、链式错误与聚合')]: [
    jsExample(
      'Promise 状态只能从 pending 转换一次',
      'Node.js',
      `const promise = new Promise((resolve, reject) => {
  resolve('first');
  resolve('second');
  reject(new Error('ignored'));
});
promise.then((value) => {
  console.log('fulfilled with', value);
});
setTimeout(() => console.log('still fulfilled'), 5);`,
      `fulfilled with first
still fulfilled`,
    ),
    jsExample(
      '错误沿 Promise 链向后传播',
      'Node.js',
      `Promise.resolve({ amount: 'bad' })
  .then((row) => {
    if (!Number.isFinite(row.amount)) throw new RangeError('amount must be numeric');
    return row.amount;
  })
  .then((amount) => amount.toFixed(2))
  .catch((error) => {
    console.log('caught', error.name, error.message);
    return 'fallback';
  })
  .then((value) => console.log('continued', value));`,
      `caught RangeError amount must be numeric
continued fallback`,
    ),
    jsExample(
      'allSettled 保留每项成功与失败',
      'Node.js',
      `const jobs = [
  Promise.resolve({ id: 'ok-1', amount: 10 }),
  Promise.reject(new Error('timeout')),
  Promise.resolve({ id: 'ok-2', amount: 20 }),
];
Promise.allSettled(jobs).then((results) => {
  const ok = results.filter((result) => result.status === 'fulfilled');
  const failed = results.filter((result) => result.status === 'rejected');
  console.log('ok', ok.length, 'failed', failed.length);
  console.log(ok.map((result) => result.value.id));
});`,
      `ok 2 failed 1
[ 'ok-1', 'ok-2' ]`,
    ),
    jsExample(
      'race 与 any 的完成条件不同',
      'Node.js',
      `const fast = new Promise((resolve) => setTimeout(resolve, 5, 'fast'));
const fail = new Promise((_, reject) => setTimeout(reject, 10, new Error('slow-fail')));
const slow = new Promise((resolve) => setTimeout(resolve, 20, 'slow'));

Promise.race([fast, fail, slow]).then((value) => console.log('race', value));
Promise.any([
  new Promise((_, reject) => setTimeout(reject, 5, new Error('bad'))),
  new Promise((resolve) => setTimeout(resolve, 10, 'usable')),
]).then((value) => console.log('any', value));`,
      `race fast
any usable
race 接受最先完成的任何状态，any 忽略拒绝直到首个成功。`,
    ),
    jsExample(
      '异步结果统一返回 data 或 error',
      'Node.js',
      `async function resultOf(task) {
  try {
    return { ok: true, data: await task(), error: null };
  } catch (error) {
    return { ok: false, data: null, error: { name: error.name, message: error.message } };
  }
}
const success = await resultOf(async () => 42);
const failure = await resultOf(async () => { throw new RangeError('bad input'); });
console.log(success);
console.log(failure);`,
      `{ ok: true, data: 42, error: null }
{ ok: false, data: null, error: { name: 'RangeError', message: 'bad input' } }`,
    ),
  ],
  [jsName(j3Stage, 'async/await、顺序与并发')]: [
    jsExample(
      'async 函数总是返回 Promise',
      'Node.js',
      `async function immediate(value) {
  return value * 2;
}
const result = immediate(5);
console.log('is promise', result instanceof Promise);
result.then((value) => {
  console.log('resolved', value);
  console.log('type', typeof value);
});`,
      `is promise true
resolved 10
type number`,
    ),
    jsExample(
      '独立任务并发执行而不是逐项等待',
      'Node.js',
      `const sleep = (ms, value) => new Promise((resolve) => setTimeout(resolve, ms, value));
const startSequential = Date.now();
await sleep(40, 'A');
await sleep(40, 'B');
const sequential = Date.now() - startSequential;

const startParallel = Date.now();
const values = await Promise.all([sleep(40, 'A'), sleep(40, 'B')]);
const parallel = Date.now() - startParallel;
console.log(values, { sequential, parallel, faster: parallel < sequential });`,
      `[ 'A', 'B' ] { sequential: 82, parallel: 42, faster: true }`,
    ),
    jsExample(
      'try/catch 只包围会产生错误的异步边界',
      'Node.js',
      `const parseResponse = async (text) => {
  const data = JSON.parse(text);
  if (!data.id) throw new RangeError('id missing');
  return data;
};
async function sync(body) {
  let data;
  try {
    data = await parseResponse(body);
  } catch (error) {
    console.log('sync failed', error.name, error.message);
    return { ok: false };
  }
  console.log('saved', data.id);
  return { ok: true, id: data.id };
}
await sync('{"id":"row-1"}');
await sync('{"name":"missing"}');`,
      `saved row-1
sync failed RangeError id missing`,
    ),
    jsExample(
      '部分成功用显式状态返回',
      'Node.js',
      `async function importRows(rows) {
  const results = await Promise.allSettled(rows.map(async (row) => {
    if (!row.id) throw new Error('id required');
    return { ...row, imported: true };
  }));
  return {
    imported: results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []),
    rejected: results.flatMap((result, index) => result.status === 'rejected'
      ? [{ index, message: result.reason.message }]
      : []),
  };
}
console.log(await importRows([{ id: 'A' }, {}, { id: 'C' }]));`,
      `{
  imported: [ { id: 'A', imported: true }, { id: 'C', imported: true } ],
  rejected: [ { index: 1, message: 'id required' } ]
}`,
    ),
    jsExample(
      '取消信号从入口传到具体副作用',
      'Node.js',
      `const controller = new AbortController();
async function waitForResource(signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 100, 'loaded');
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}
const task = waitForResource(controller.signal);
setTimeout(() => controller.abort(new DOMException('leave page', 'AbortError')), 5);
try { await task; } catch (error) { console.log(error.name, error.message); }`,
      `AbortError leave page
定时器已清理，等待中的 Promise 以同一个取消原因结束。`,
    ),
  ],
  [jsName(j3Stage, 'AbortController、超时与取消')]: [
    jsExample(
      '取消信号是单向事件',
      'Node.js',
      `const controller = new AbortController();
const signal = controller.signal;
console.log('before', signal.aborted);
signal.addEventListener('abort', () => {
  console.log('abort event', signal.aborted, signal.reason.name);
}, { once: true });
controller.abort(new DOMException('user cancelled', 'AbortError'));
controller.abort(new Error('ignored'));
console.log('after', signal.aborted);`,
      `before false
abort event true AbortError
after true`,
    ),
    jsExample(
      'Fetch 非 2xx 响应必须进入失败分支',
      'Node.js',
      `async function readOrder() {
  const response = await fetch('https://api.example.test/orders/missing');
  if (!response.ok) {
    const body = await response.text();
    throw new Error('HTTP ' + response.status + ': ' + body);
  }
  return response.json();
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('not found', { status: 404 });
try { await readOrder(); }
catch (error) { console.log(error.message); }
finally { globalThis.fetch = originalFetch; }`,
      `HTTP 404: not found
网络成功只表示拿到了响应，状态码仍需显式判断。`,
    ),
    jsExample(
      '组合外部取消与内部超时原因',
      'Node.js 20+',
      `const external = new AbortController();
const timeout = AbortSignal.timeout(20);
const signal = AbortSignal.any([external.signal, timeout]);
await new Promise((resolve) => {
  signal.addEventListener('abort', () => {
    console.log('name', signal.reason.name);
    console.log('timeout fired', timeout.aborted);
    resolve();
  }, { once: true });
});`,
      `name TimeoutError
timeout fired true
若外部先取消，reason 会保留外部传入的 AbortError。`,
    ),
    jsExample(
      '取消后的旧响应失去写入权',
      'Browser JavaScript',
      `let controller = null;
let visible = '';
async function search(query) {
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  try {
    console.log('request', query);
    await new Promise((resolve) => setTimeout(resolve, query === 'A' ? 30 : 5));
    if (current.signal.aborted) return;
    visible = query;
    console.log('rendered', visible);
  } catch (error) {
    console.log('ignored', error.name);
  }
}
const first = search('A');
const second = search('B');
await Promise.all([first, second]);
console.log('final', visible);`,
      `request A
request B
rendered B
final B`,
    ),
    jsExample(
      '用 Vitest 假时钟稳定测试超时',
      'Vitest',
      `import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('aborts after the timeout', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 1000);
  await vi.advanceTimersByTimeAsync(999);
  expect(controller.signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(controller.signal.aborted).toBe(true);
});`,
      `✓ aborts after the timeout
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
  ],
  [jsName(j3Stage, '事件循环阻塞与任务切片')]: [
    jsExample(
      '先测量长任务占用主线程',
      'Browser JavaScript',
      `function expensive(limit) {
  let total = 0;
  for (let index = 0; index < limit; index += 1) total += Math.sqrt(index);
  return total;
}
const started = performance.now();
expensive(10_000_000);
const ended = performance.now();
console.log('blocking task', Math.round(ended - started), 'ms');
requestAnimationFrame(() => console.log('next frame', Math.round(performance.now() - started), 'ms'));`,
      `blocking task 184 ms
next frame 201 ms
主线程在循环结束前无法处理点击、计时器或下一次绘制。`,
    ),
    jsExample(
      '按时间预算切片并让出调用栈',
      'Browser JavaScript',
      `function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
async function slice(rows, onChunk, budgetMs = 8) {
  let index = 0;
  while (index < rows.length) {
    const started = performance.now();
    const chunk = [];
    while (index < rows.length && performance.now() - started < budgetMs) {
      chunk.push(rows[index++]);
    }
    await onChunk(chunk);
    await yieldToBrowser();
  }
}
let count = 0;
await slice(Array.from({ length: 50_000 }, (_, id) => id), async (chunk) => {
  count += chunk.length;
});
console.log('processed', count);`,
      `processed 50000
每次让出后浏览器获得处理输入和渲染的机会，业务总数保持不变。`,
    ),
    jsExample(
      '进度与取消组成显式状态机',
      'Browser JavaScript',
      `function createImportState() {
  let phase = 'idle';
  let processed = 0;
  return {
    start(total) { phase = 'running'; processed = 0; return total; },
    advance(count) {
      if (phase !== 'running') throw new Error('not running');
      processed += count;
      return processed;
    },
    cancel() { if (phase === 'running') phase = 'cancelled'; },
    snapshot() { return { phase, processed }; },
  };
}
const state = createImportState();
state.start(100);
state.advance(40);
state.cancel();
console.log(state.snapshot());`,
      `{ phase: 'cancelled', processed: 40 }
取消后不能再推进结果，界面可以显示已处理数量与结束原因。`,
    ),
    jsExample(
      'Worker 隔离重计算但仍传输入输出',
      'Browser JavaScript',
      `// worker.js
self.onmessage = ({ data }) => {
  const values = data.map((value) => value * value);
  self.postMessage({ input: data.length, sum: values.reduce((a, b) => a + b, 0) });
};

// main.js
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.postMessage([1, 2, 3, 4]);
worker.onmessage = ({ data }) => {
  console.log(data);
  worker.terminate();
};
console.log('main thread continues');`,
      `main thread continues
{ input: 4, sum: 30 }
计算离开主线程，但大数组的结构化克隆复制成本仍需测量。`,
    ),
    jsExample(
      '性能优化同时断言结果一致',
      'Vitest',
      `import { expect, it } from 'vitest';

const regular = (rows) => rows.map((row) => row * 2).filter((value) => value > 4);
const chunked = async (rows) => {
  const output = [];
  for (let index = 0; index < rows.length; index += 2) {
    output.push(...rows.slice(index, index + 2).map((row) => row * 2));
    await Promise.resolve();
  }
  return output.filter((value) => value > 4);
};

it('keeps behavior after slicing', async () => {
  const input = [1, 2, 3, 4, 5];
  expect(await chunked(input)).toEqual(regular(input));
});`,
      `✓ keeps behavior after slicing
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
  ],
  [jsName(j3Stage, '异步请求工程与竞态测试')]: [
    jsExample(
      '请求结果区分空数据与失败',
      'Node.js',
      `async function requestRows(client) {
  try {
    const response = await client.get('/orders');
    if (!response.ok) return { ok: false, rows: [], error: 'HTTP ' + response.status };
    const rows = await response.json();
    return { ok: true, rows, error: null };
  } catch (error) {
    return { ok: false, rows: [], error: error.message };
  }
}
const client = { get: async () => ({ ok: true, json: async () => [] }) };
console.log(await requestRows(client));`,
      `{ ok: true, rows: [], error: null }
空数组是成功数据；失败结果必须带 ok=false 与原因。`,
    ),
    jsExample(
      '只对可恢复错误做有限重试',
      'Node.js',
      `async function retry(task, max = 3) {
  let last;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try { return { value: await task(attempt), attempts: attempt }; }
    catch (error) {
      last = error;
      const retryable = error.status === 429 || error.status >= 500;
      if (!retryable) throw error;
    }
  }
  throw last;
}
let calls = 0;
const value = await retry(async () => {
  calls += 1;
  if (calls < 3) throw Object.assign(new Error('busy'), { status: 503 });
  return 'ok';
});
console.log(value);`,
      `{ value: 'ok', attempts: 3 }
前两次 503 被重试，第三次成功；400 会立即抛出而不会耗尽次数。`,
    ),
    jsExample(
      '并发上限保护下游服务',
      'Node.js',
      `async function runLimited(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
      console.log('completed', index);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
const tasks = Array.from({ length: 5 }, (_, index) => async () => index * 10);
console.log(await runLimited(tasks, 2));`,
      `completed 0
completed 1
completed 2
completed 3
completed 4
[ 0, 10, 20, 30, 40 ]`,
    ),
    jsExample(
      '旧响应同时受版本号和取消保护',
      'Browser JavaScript',
      `let version = 0;
let active = null;
async function load(query) {
  const ownVersion = ++version;
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  const response = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(query.toUpperCase()), 10);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve(null);
    }, { once: true });
  });
  if (signal.aborted || ownVersion !== version || response === null) return;
  console.log('render', response, 'version', ownVersion);
}
await Promise.all([load('a'), load('b')]);
console.log('current version', version);`,
      `render B version 2
current version 2
请求 A 被取消，即使响应晚到也会因版本和 signal 两个条件被丢弃。`,
    ),
    jsExample(
      '用可控 Promise 复现请求完成顺序',
      'Vitest',
      `import { expect, it } from 'vitest';

it('renders the newest request only', async () => {
  const resolvers = [];
  let visible = '';
  let version = 0;
  const load = () => {
    const own = ++version;
    return new Promise((resolve) => resolvers.push({ own, resolve }));
  };
  const first = load();
  const second = load();
  resolvers[1].resolve('B');
  await second.then((value) => {
    if (version === resolvers[1].own) visible = value;
  });
  resolvers[0].resolve('A');
  await first.then((value) => {
    if (version === resolvers[0].own) visible = value;
  });
  expect(visible).toBe('B');
});`,
      `✓ renders the newest request only
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
  ],
  [jsName(j4Stage, 'DOM 查询、创建与安全更新')]: [
    jsExample(
      '选择器绑定到具体容器而不是整页',
      'Browser JavaScript',
      `const card = document.querySelector('#order-A');
const title = card.querySelector('[data-role="title"]');
const outside = document.querySelector('#order-B [data-role="title"]');
console.log('inside card', title.textContent);
console.log('outside card', outside.textContent);
console.log('same node', title === outside);
console.log('card contains title', card.contains(title));`,
      `inside card Order A
outside card Order B
same node false
card contains title true`,
    ),
    jsExample(
      '先组装 fragment 再挂载到文档',
      'Browser JavaScript',
      `const list = document.querySelector('#orders');
const fragment = document.createDocumentFragment();
for (const row of [{ id: 'A', amount: 100 }, { id: 'B', amount: 80 }]) {
  const item = document.createElement('li');
  item.dataset.id = row.id;
  item.textContent = row.id + ' / ' + row.amount;
  fragment.append(item);
}
console.log('before mount', list.children.length);
list.append(fragment);
console.log('after mount', list.children.length);`,
      `before mount 0
after mount 2
fragment 中的节点一次性转移，没有逐项触发布局抖动。`,
    ),
    jsExample(
      '不可信文本只进入 textContent',
      'Browser JavaScript',
      `const output = document.querySelector('#message');
const userInput = '<img src=x onerror="alert(1)">';
output.textContent = userInput;
console.log('text', output.textContent);
console.log('img nodes', output.querySelectorAll('img').length);

const unsafe = document.createElement('div');
unsafe.innerHTML = userInput;
console.log('unsafe img nodes', unsafe.querySelectorAll('img').length);`,
      `text <img src=x onerror="alert(1)">
img nodes 0
unsafe img nodes 1
textContent 把标记当字符显示，innerHTML 会解析成真实元素。`,
    ),
    jsExample(
      '写入 URL 属性前校验协议',
      'Browser JavaScript',
      `const allowed = new Set(['https:', 'mailto:']);
function safeUrl(raw) {
  const url = new URL(raw, location.origin);
  if (!allowed.has(url.protocol)) throw new TypeError('blocked protocol: ' + url.protocol);
  return url.href;
}
const link = document.querySelector('#contact');
for (const value of ['https://example.test/help', 'javascript:alert(1)']) {
  try {
    link.href = safeUrl(value);
    console.log('accepted', link.getAttribute('href'));
  } catch (error) {
    console.log('rejected', error.message);
  }
}`,
      `accepted https://example.test/help
rejected blocked protocol: javascript:
被拒绝的输入没有写入 href，不会成为可点击的执行入口。`,
    ),
    jsExample(
      '用 DOM 断言验证用户最终看到的结果',
      'Vitest + jsdom',
      `import { expect, it } from 'vitest';
import { renderOrder } from './order-view.js';

it('renders escaped text and a safe amount', () => {
  document.body.innerHTML = '<section id="app"></section>';
  renderOrder(document.querySelector('#app'), {
    id: 'A',
    title: '<b>Order</b>',
    amount: 12.5,
  });
  expect(document.querySelector('h2').textContent).toBe('<b>Order</b>');
  expect(document.querySelector('b')).toBeNull();
  expect(document.querySelector('[data-amount]').textContent).toBe('12.50');
});`,
      `✓ renders escaped text and a safe amount
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
  ],
  [jsName(j4Stage, '事件冒泡、委托与默认行为')]: [
    jsExample(
      '记录事件经过的传播路径',
      'Browser JavaScript',
      `const outer = document.querySelector('#outer');
const button = document.querySelector('#save');
outer.addEventListener('click', (event) => {
  console.log('bubble target', event.target.id, 'current', event.currentTarget.id);
});
button.addEventListener('click', () => console.log('button handler'));
button.click();
console.log('capture experiment: add { capture: true } to observe outer first');`,
      `button handler
bubble target save current outer
capture experiment: add { capture: true } to observe outer first`,
    ),
    jsExample(
      '父节点委托处理动态列表',
      'Browser JavaScript',
      `const list = document.querySelector('#tasks');
list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !list.contains(button)) return;
  const row = button.closest('li');
  console.log(button.dataset.action, row.dataset.id);
});
for (const id of ['t-1', 't-2']) {
  const item = document.createElement('li');
  item.dataset.id = id;
  item.innerHTML = '<button data-action="complete">完成</button>';
  list.append(item);
}
list.querySelector('li[data-id="t-2"] button').click();`,
      `complete t-2
新插入的按钮不需要单独注册监听器，父节点通过选择的动作处理。`,
    ),
    jsExample(
      '默认动作与传播是两种不同控制',
      'Browser JavaScript',
      `const form = document.querySelector('#filters');
const panel = document.querySelector('#panel');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  console.log('submit prevented', event.defaultPrevented);
});
panel.addEventListener('click', (event) => {
  if (event.target.matches('[data-stop]')) {
    event.stopPropagation();
    console.log('bubble stopped at panel');
  }
});
document.body.addEventListener('click', () => console.log('body click'));
form.dispatchEvent(new Event('submit', { cancelable: true }));
panel.querySelector('[data-stop]').click();`,
      `submit prevented true
bubble stopped at panel
preventDefault 阻止表单导航，stopPropagation 阻止祖先监听器收到事件。`,
    ),
    jsExample(
      '鼠标与键盘共享同一个业务动作',
      'Browser JavaScript',
      `const save = document.querySelector('#save');
function performSave(source) {
  console.log('save from', source);
}
save.addEventListener('click', () => performSave('pointer'));
save.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    performSave('keyboard:' + event.key);
  }
});
save.click();
save.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`,
      `save from pointer
save from keyboard:Enter
两种输入进入同一函数，原生 button 本身也会处理 Enter 与 Space 语义。`,
    ),
    jsExample(
      '用 AbortSignal 成对移除事件监听',
      'Browser JavaScript',
      `const input = document.querySelector('#query');
const controller = new AbortController();
let count = 0;
input.addEventListener('input', () => {
  count += 1;
  console.log('input handled', count);
}, { signal: controller.signal });
input.value = 'a';
input.dispatchEvent(new Event('input'));
controller.abort();
input.dispatchEvent(new Event('input'));
console.log('aborted', controller.signal.aborted, 'count', count);`,
      `input handled 1
aborted true count 1
取消控制器一次释放该信号下注册的监听器，适合页面或组件卸载。`,
    ),
  ],
  [jsName(j4Stage, 'Fetch、响应、错误与流式读取')]: [
    jsExample(
      '先检查响应头再读取正文',
      'Node.js fetch',
      `const original = globalThis.fetch;
globalThis.fetch = async () => new Response('{"id":"o-1"}', {
  status: 200,
  headers: { 'content-type': 'application/json', 'x-request-id': 'req-7' },
});
const response = await fetch('https://api.example.test/orders/o-1');
console.log('request id', response.headers.get('x-request-id'));
console.log('content type', response.headers.get('content-type'));
console.log('body', await response.json());
globalThis.fetch = original;`,
      `request id req-7
content type application/json
body { id: 'o-1' }
读取正文会消耗 body，调试时不要提前调用两次 json。`,
    ),
    jsExample(
      'HTTP 404 不会让 Fetch 自动 reject',
      'Node.js fetch',
      `async function load(client, id) {
  const response = await client.get('/orders/' + id);
  if (!response.ok) {
    const message = await response.text();
    throw new Error('load failed ' + response.status + ' ' + message);
  }
  return response.json();
}
const client = {
  get: async () => new Response('missing', { status: 404 }),
};
try { await load(client, '404'); }
catch (error) { console.log(error.message); }`,
      `load failed 404 missing
只有网络层失败才会让 fetch 直接拒绝，业务必须显式检查 response.ok。`,
    ),
    jsExample(
      '按 Content-Type 选择解析器',
      'Node.js fetch',
      `async function decode(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  if (contentType.startsWith('text/')) return response.text();
  throw new TypeError('unsupported content-type: ' + contentType);
}
const json = new Response('{"amount":12}', { headers: { 'content-type': 'application/json' } });
const text = new Response('ready', { headers: { 'content-type': 'text/plain' } });
console.log(await decode(json));
console.log(await decode(text));
try { await decode(new Response('x', { headers: { 'content-type': 'image/png' } })); }
catch (error) { console.log(error.message); }`,
      `{ amount: 12 }
ready
unsupported content-type: image/png`,
    ),
    jsExample(
      '逐块读取流并处理 UTF-8 边界',
      'Node.js streams',
      `const encoder = new TextEncoder();
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode('订单'));
    controller.enqueue(encoder.encode('已创建'));
    controller.close();
  },
});
const reader = stream.getReader();
const decoder = new TextDecoder();
let text = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  text += decoder.decode(value, { stream: true });
}
text += decoder.decode();
console.log('decoded', text);`,
      `decoded 订单已创建
流式解码保留跨 chunk 的字节残片，不能在每个块结束时丢掉 decoder 状态。`,
    ),
    jsExample(
      '用可控响应覆盖 Fetch 失败矩阵',
      'Vitest',
      `import { expect, it, vi } from 'vitest';

it('maps protocol failures to stable results', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('no', { status: 503 }))
    .mockResolvedValueOnce(new Response('{"rows":[]}', {
      headers: { 'content-type': 'application/json' },
    }));
  vi.stubGlobal('fetch', fetchMock);

  const failed = await fetch('/rows');
  expect(failed.ok).toBe(false);
  const success = await fetch('/rows');
  expect(await success.json()).toEqual({ rows: [] });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});`,
      `✓ maps protocol failures to stable results
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
  ],
  [jsName(j4Stage, 'Storage、IndexedDB 与离线边界')]: [
    jsExample(
      '把小型偏好存成版本化 JSON',
      'Browser JavaScript',
      `const key = 'prefs:v1';
const value = { theme: 'dark', density: 'compact', updatedAt: Date.now() };
localStorage.setItem(key, JSON.stringify(value));
const restored = JSON.parse(localStorage.getItem(key));
console.log(restored.theme, restored.density);
console.log('string length', localStorage.getItem(key).length);
localStorage.removeItem(key);
console.log('removed', localStorage.getItem(key));`,
      `dark compact
string length 72
removed null
Storage 只保存字符串，读取方必须重新验证 JSON 内容和版本。`,
    ),
    jsExample(
      '配额失败进入降级而不是白屏',
      'Browser JavaScript',
      `function saveDraft(storage, text) {
  try {
    storage.setItem('draft', text);
    return { ok: true, persisted: true };
  } catch (error) {
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      return { ok: true, persisted: false, reason: 'quota' };
    }
    throw error;
  }
}
const storage = {
  setItem() { throw new DOMException('quota exceeded', 'QuotaExceededError'); },
};
console.log(saveDraft(storage, 'x'.repeat(1000)));`,
      `{ ok: true, persisted: false, reason: 'quota' }
页面可以继续把草稿留在内存，同时提示用户导出或清理空间。`,
    ),
    jsExample(
      'IndexedDB 以事务完成批量写入',
      'Browser JavaScript',
      `const request = indexedDB.open('orders', 1);
request.onupgradeneeded = () => {
  request.result.createObjectStore('rows', { keyPath: 'id' });
};
request.onsuccess = async () => {
  const db = request.result;
  const tx = db.transaction('rows', 'readwrite');
  const store = tx.objectStore('rows');
  store.put({ id: 'A', amount: 100 });
  store.put({ id: 'B', amount: 80 });
  tx.oncomplete = () => {
    console.log('committed', 2);
    db.close();
  };
  tx.onerror = () => console.error('transaction failed', tx.error);
};`,
      `committed 2
同一个事务内两次 put 一起提交；任一请求失败时事务会回滚并触发 error。`,
    ),
    jsExample(
      '缓存条目同时记录版本与时间',
      'Browser JavaScript',
      `const cacheKey = 'catalog:v3';
const cache = {
  get() { return localStorage.getItem(cacheKey); },
  set(value) {
    localStorage.setItem(cacheKey, JSON.stringify({
      value,
      schema: 3,
      savedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }));
  },
};
cache.set([{ id: 'A' }]);
const entry = JSON.parse(cache.get());
console.log('schema', entry.schema);
console.log('fresh', entry.expiresAt > Date.now());
console.log('rows', entry.value.length);`,
      `schema 3
fresh true
rows 1
版本升级或超过 expiresAt 时必须丢弃旧结构，而不是强行读取。`,
    ),
    jsExample(
      '在线离线只改变能力状态',
      'Browser JavaScript',
      `const state = { online: navigator.onLine, pending: 0 };
function render() {
  console.log({ ...state, label: state.online ? '在线' : '离线' });
}
addEventListener('online', () => { state.online = true; render(); });
addEventListener('offline', () => { state.online = false; render(); });
render();
state.pending += 1;
console.log('queued while offline', state.pending);
state.online = true;
console.log('sync required before clearing', state.pending);`,
      `{ online: true, pending: 0, label: '在线' }
queued while offline 1
sync required before clearing 1`,
    ),
  ],
  [jsName(j4Stage, '表单、焦点与可访问交互')]: [
    jsExample(
      '用原生表单语义承载键盘与提交',
      'HTML',
      `<form id="login" action="/session" method="post">
  <label for="email">邮箱</label>
  <input id="email" name="email" type="email" required />
  <label for="password">密码</label>
  <input id="password" name="password" type="password" required minlength="8" />
  <button type="submit">登录</button>
</form>
<p id="status" role="status" aria-live="polite"></p>

<!-- 原生 form、label、required 已提供名称、焦点顺序和提交语义。 -->`,
      `Tab 依次聚焦邮箱、密码、登录按钮
空邮箱提交时浏览器阻止请求并聚焦必填字段
辅助技术读出 label 与当前错误状态`,
    ),
    jsExample(
      'FormData 与约束校验在提交前执行',
      'Browser JavaScript',
      `const form = document.querySelector('#checkout');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    console.log('client invalid');
    return;
  }
  const data = new FormData(form);
  const payload = {
    email: String(data.get('email')).trim(),
    quantity: Number(data.get('quantity')),
  };
  console.log('submit payload', payload);
});`,
      `client invalid
submit payload { email: 'ada@example.test', quantity: 2 }
必填和类型约束先给出即时反馈，服务端仍必须重复校验。`,
    ),
    jsExample(
      '提交中禁用按钮并防止重复请求',
      'Browser JavaScript',
      `const form = document.querySelector('#order-form');
const button = form.querySelector('button[type="submit"]');
let inFlight = null;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (inFlight) {
    console.log('duplicate ignored');
    return;
  }
  button.disabled = true;
  inFlight = new Promise((resolve) => setTimeout(resolve, 20));
  try {
    await inFlight;
    console.log('created order');
  } finally {
    button.disabled = false;
    inFlight = null;
  }
});
form.requestSubmit();
form.requestSubmit();`,
      `created order
duplicate ignored
按钮在请求完成前禁用，逻辑层仍保留并发守卫以覆盖双击竞态。`,
    ),
    jsExample(
      '错误出现后把焦点送到可修复字段',
      'Browser JavaScript',
      `const form = document.querySelector('#profile');
const status = document.querySelector('#form-status');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = form.elements.email;
  if (!email.validity.valid) {
    status.textContent = '请输入有效邮箱';
    email.setAttribute('aria-describedby', 'form-status');
    email.focus();
    console.log('focus', document.activeElement.name);
    return;
  }
  status.textContent = '已保存';
  console.log('focus after success remains on', document.activeElement.name);
});`,
      `focus email
错误状态与字段通过 aria-describedby 关联，用户无需自行寻找失败位置。`,
    ),
    jsExample(
      'Playwright 用键盘完成表单流程',
      'Playwright',
      `import { expect, test } from '@playwright/test';

test('submits the login form with the keyboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('ada@example.test');
  await page.getByLabel('密码').fill('correct-horse');
  await page.getByLabel('密码').press('Enter');
  await expect(page.getByRole('status')).toHaveText('登录成功');
  await expect(page).toHaveURL(/\\/dashboard$/);
});`,
      `1 passed
浏览器确认 label 关联、键盘提交、状态播报与路由跳转都可工作。`,
    ),
  ],
  [jsName(j4Stage, '浏览器数据页面实验')]: [
    jsExample(
      '先定义页面状态而不是直接改 DOM',
      'JavaScript',
      `const initial = { phase: 'idle', rows: [], error: null, query: '' };
function reducer(state, action) {
  switch (action.type) {
    case 'load': return { ...state, phase: 'loading', query: action.query, error: null };
    case 'success': return { ...state, phase: 'ready', rows: action.rows };
    case 'failure': return { ...state, phase: 'error', error: action.message };
    default: return state;
  }
}
let state = reducer(initial, { type: 'load', query: 'gold' });
state = reducer(state, { type: 'success', rows: [{ id: 'A' }] });
console.log(state);
try { state = reducer(state, { type: 'unknown' }); } catch (error) { console.log(error.name); }`,
      `{ phase: 'ready', rows: [ { id: 'A' } ], error: null, query: 'gold' }
未知动作保持原状态，界面只消费当前 phase、rows 与 error。`,
    ),
    jsExample(
      '筛选条件成为请求身份的一部分',
      'Browser JavaScript',
      `let sequence = 0;
let controller = null;
async function query(text, activeOnly) {
  const id = ++sequence;
  controller?.abort();
  controller = new AbortController();
  const params = new URLSearchParams({ q: text.trim(), active: String(activeOnly) });
  console.log('request', id, params.toString());
  await new Promise((resolve) => setTimeout(resolve, 5));
  if (controller.signal.aborted) return;
  console.log('accept response', id);
}
const first = query('gr', false);
const second = query('gold', true);
await Promise.all([first, second]);`,
      `request 1 q=gr&active=false
request 2 q=gold&active=true
accept response 2`,
    ),
    jsExample(
      '加载空结果与错误分别呈现',
      'Browser JavaScript',
      `function viewModel(state) {
  if (state.phase === 'loading') return { message: '正在加载', rows: [] };
  if (state.phase === 'error') return { message: state.error.message, rows: [] };
  if (state.phase === 'ready' && state.rows.length === 0) {
    return { message: '没有符合条件的订单', rows: [] };
  }
  return { message: '已加载 ' + state.rows.length + ' 条', rows: state.rows };
}
for (const state of [
  { phase: 'loading', rows: [] },
  { phase: 'ready', rows: [] },
  { phase: 'error', rows: [], error: new Error('网络不可用') },
  { phase: 'ready', rows: [{ id: 'A' }] },
]) {
  console.log(viewModel(state).message);
}`,
      `正在加载
没有符合条件的订单
网络不可用
已加载 1 条
每个状态只映射到一个用户可见结论，空白页面不会掩盖失败原因。`,
    ),
    jsExample(
      '缓存显示前核对作用域与新鲜度',
      'Browser JavaScript',
      `const cache = new Map([
  ['tenant-a:orders', { rows: [{ id: 'A' }], savedAt: 1000 }],
]);
function readCache(tenant, now, ttl = 5000) {
  const key = tenant + ':orders';
  const entry = cache.get(key);
  if (!entry) return { source: 'network', reason: 'missing' };
  if (now - entry.savedAt > ttl) return { source: 'network', reason: 'expired' };
  return { source: 'cache', rows: entry.rows, age: now - entry.savedAt };
}
console.log(readCache('tenant-a', 3000));
console.log(readCache('tenant-b', 3000));
console.log(readCache('tenant-a', 9000));`,
      `{ source: 'cache', rows: [ { id: 'A' } ], age: 2000 }
{ source: 'network', reason: 'missing' }
{ source: 'network', reason: 'expired' }`,
    ),
    jsExample(
      'Playwright 覆盖筛选与空结果',
      'Playwright',
      `import { expect, test } from '@playwright/test';

test('filters orders and shows an empty state', async ({ page }) => {
  await page.route('**/api/orders?*', async (route) => {
    const url = new URL(route.request().url());
    const rows = url.searchParams.get('q') === 'missing' ? [] : [{ id: 'A' }];
    await route.fulfill({ json: { rows } });
  });
  await page.goto('/orders');
  await page.getByLabel('搜索').fill('missing');
  await expect(page.getByText('没有符合条件的订单')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('0 条');
});`,
      `1 passed
真实路由参数、空数组和用户可见状态在同一浏览器流程中完成验证。`,
    ),
  ],
  [jsName(j5Stage, 'ESM、动态导入与包解析')]: [
    jsExample(
      '静态导入先链接模块图再执行',
      'Node.js ESM · 双文件',
      `// config.js
console.log('config evaluated');
export const retries = 3;

// app.js
import { retries } from './config.js';
console.log('app start', retries);

// 执行：node app.js`,
      `config evaluated
app start 3
依赖模块先完成求值，静态 import 不能放在条件分支里。`,
    ),
    jsExample(
      '显式区分默认导出与命名导出',
      'Node.js ESM · 双文件',
      `// formatter.js
export const upper = (value) => String(value).toUpperCase();
export default function money(cents) { return (cents / 100).toFixed(2); }

// app.js
import money, { upper } from './formatter.js';
console.log(money(1299), upper('ready'));
try {
  const module = await import('./formatter.js');
  console.log(Object.keys(module));
} catch (error) {
  console.log(error.name, error.message);
}`,
      `12.99 READY
[ 'default', 'upper' ]
导出名称是公共契约，改名会立刻破坏所有导入方。`,
    ),
    jsExample(
      '动态导入按需加载并处理失败',
      'Node.js ESM',
      `async function loadFeature(name) {
  try {
    const started = performance.now();
    const module = await import('./features/' + name + '.js');
    console.log('loaded', name, Math.round(performance.now() - started));
    return module.run();
  } catch (error) {
    console.log('feature failed', name, error.code ?? error.message);
    return null;
  }
}
console.log(await loadFeature('report'));
console.log(await loadFeature('missing'));`,
      `loaded report 4
report ready
feature failed missing ERR_MODULE_NOT_FOUND
null`,
    ),
    jsExample(
      '用 import.meta 读取真实模块位置',
      'Node.js ESM',
      `import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const file = fileURLToPath(import.meta.url);
const directory = dirname(file);
console.log('module url', import.meta.url.startsWith('file:'));
console.log('filename', file.endsWith('meta.mjs'));
console.log('fixture path', join(directory, 'fixtures', 'rows.json'));
// 执行：node meta.mjs`,
      `module url true
filename true
fixture path C:\\work\\fixtures\\rows.json`,
    ),
    jsExample(
      '从 package exports 验证公开入口',
      'Node.js + PowerShell',
      `// package.json
{
  "name": "@demo/orders",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./test": "./dist/testing.js"
  }
}

// 验证
node --input-type=module -e "console.log(import.meta.resolve('@demo/orders'))"
node --input-type=module -e "import('@demo/orders/private').catch(e=>console.log(e.code))"`,
      `file:///workspace/node_modules/@demo/orders/dist/index.js
ERR_PACKAGE_PATH_NOT_EXPORTED
未在 exports 中声明的内部文件不能由裸包名导入。`,
    ),
  ],
  [jsName(j5Stage, 'pnpm、锁文件与依赖边界')]: [
    jsExample(
      '所有直接导入都写入依赖清单',
      'PowerShell + Node.js',
      `node -e "const p=require('./package.json'); console.log(p.dependencies)"
pnpm why zod
node --input-type=module -e "import('zod').then(()=>console.log('resolved')).catch(e=>console.log(e.code))"`,
      `{ zod: '^4.1.0' }
zod 4.1.0
resolved
如果代码 import zod 但清单没有声明，干净安装后只会得到 ERR_MODULE_NOT_FOUND。`,
    ),
    jsExample(
      '锁文件与清单不一致时停止 CI',
      'PowerShell',
      `pnpm install --frozen-lockfile
pnpm list --depth 0
pnpm exec vite --version
# 失败实验：修改 package.json 中的 vite 版本后执行 frozen install`,
      `Lockfile is up to date, resolution step is skipped
vite 7.2.2
vite v7.2.2
ERR_PNPM_OUTDATED_LOCKFILE Cannot install with "frozen-lockfile"`,
    ),
    jsExample(
      '工作区只能通过公开包名跨项目导入',
      'pnpm workspace',
      `// packages/orders/package.json
{
  "name": "@demo/orders",
  "exports": { ".": "./src/index.js" }
}

// apps/web/src/order.js
import { loadOrder } from '@demo/orders';
console.log(loadOrder('A'));

// 执行：pnpm --filter @demo/web test`,
      `order:A
跨包导入经 @demo/orders 的 exports 解析，不使用 ../../orders/src/internal.js。`,
    ),
    jsExample(
      'peer dependency 保证共享运行时实例',
      'pnpm workspace',
      `// packages/ui-kit/package.json
{
  "name": "@demo/ui-kit",
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": { "react": "^19.0.0" }
}

// 执行
pnpm --filter @demo/ui-kit why react
node --input-type=module -e "import('react').then(m=>console.log(typeof m.createElement))"`,
      `react 19.2.0
function
应用与组件库复用同一个 React 实例，hooks 不会因双副本读取不同调度器。`,
    ),
    jsExample(
      '依赖治理进入自动门禁',
      'PowerShell',
      `pnpm install --frozen-lockfile
pnpm audit --prod --audit-level high
pnpm outdated --format list
pnpm licenses list --prod`,
      `No known vulnerabilities found
No outdated dependencies found
MIT  12
ISC   3
门禁产生稳定退出码，高危漏洞或许可证违规会让发布任务失败。`,
    ),
  ],
  [jsName(j5Stage, 'Vite 开发服务器和构建产物')]: [
    jsExample(
      '观察开发服务按需转换模块',
      'PowerShell + Vite',
      `pnpm dev --host 127.0.0.1
Invoke-WebRequest http://127.0.0.1:5173/ | Select-Object StatusCode
Invoke-WebRequest http://127.0.0.1:5173/src/main.js | Select-Object StatusCode,Headers`,
      `StatusCode 200
content-type: text/javascript
未请求的懒加载路由不会被开发服务器预先发送到浏览器。`,
    ),
    jsExample(
      '生产构建输出入口与哈希资源',
      'Vite + PowerShell',
      `pnpm build
Get-ChildItem dist -Recurse | Select-Object FullName,Length
Select-String -Path dist/index.html -Pattern '<script|stylesheet'`,
      `dist/index.html 684
dist/assets/index-C8f2a.js 48210
dist/assets/index-D4b19.css 12003
index-C8f2a.js 与 index-D4b19.css 均由 index.html 引用。`,
    ),
    jsExample(
      '只在构建期注入公开环境变量',
      'PowerShell + Vite',
      `$env:VITE_API_BASE='https://api.example.test'
$env:SERVER_SECRET='must-not-ship'
pnpm build
Select-String -Path dist/assets/*.js -Pattern 'api.example.test|SERVER_SECRET|must-not-ship'`,
      `dist/assets/index-D8a1.js:1:https://api.example.test
SERVER_SECRET 与 must-not-ship 无匹配
VITE_ 前缀变量会公开进入产物，秘密只能由服务端运行时持有。`,
    ),
    jsExample(
      'Source Map 与构建版本一并归档',
      'Vite + PowerShell',
      `// vite.config.js
export default defineConfig(({ mode }) => ({
  build: { sourcemap: mode === 'production' ? 'hidden' : true },
}));

pnpm build --mode production
Get-FileHash dist/assets/*.map -Algorithm SHA256
Rename-Item dist/assets/index-*.js.map 'index.js.map'`,
      `SHA256 9A1F... index-D82.js.map
hidden 模式不向浏览器暴露 sourceMappingURL，但监控服务可用同名哈希上传映射。`,
    ),
    jsExample(
      '预览构建、冒烟失败后回滚',
      'PowerShell',
      `pnpm build
pnpm preview --port 4173
Invoke-WebRequest http://127.0.0.1:4173/ | Select-Object StatusCode
if ($LASTEXITCODE -ne 0) {
  Write-Error 'smoke failed, switch traffic to previous release'
  ./deploy/activate.ps1 -Release previous
}`,
      `built in 912ms
StatusCode 200
smoke failed, switch traffic to previous release
previous activated at 100 percent`,
    ),
  ],
  [jsName(j5Stage, 'ESLint、格式化和提交门禁')]: [
    jsExample(
      'Flat ESLint 配置明确覆盖源码',
      'ESLint',
      `// eslint.config.js
import js from '@eslint/js';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];

// 执行：pnpm exec eslint . --max-warnings=0`,
      `src/lookup.js
  7:7 error 'query' is assigned a value but never used no-unused-vars
✖ 1 problem (1 error, 0 warnings)`,
    ),
    jsExample(
      '格式化与语义检查分工执行',
      'PowerShell',
      `pnpm exec prettier --check 'src/**/*.js' 'tests/**/*.js'
pnpm exec eslint 'src/**/*.js' --max-warnings=0
pnpm exec prettier --write src/cart.js
pnpm exec prettier --check src/cart.js`,
      `Code style issues found in 1 file
✖ 0 problems
src/cart.js 42ms
All matched files use Prettier code style!`,
    ),
    jsExample(
      '忽略项只覆盖可解释的生成物',
      'ESLint',
      `export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'src/generated/**',
    ],
  },
  {
    files: ['**/*.js'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] },
  },
];

// 执行：pnpm exec eslint .`,
      `dist/assets/index.js ignored
coverage/lcov-report/index.html ignored
src/logger.js 3:1 error Unexpected console statement no-console
✖ 1 problem (1 error, 0 warnings)`,
    ),
    jsExample(
      '本地与 CI 复用同一条快速门禁',
      'package.json',
      `{
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "check": "pnpm lint && pnpm format:check && pnpm test"
  }
}

// 开发者与 CI 都执行：pnpm check`,
      `eslint .
prettier --check .
✓ 8 files use Prettier
Test Files  6 passed (6)
Tests       24 passed (24)`,
    ),
    jsExample(
      '门禁输出固定到版本化报告',
      'PowerShell',
      `pnpm exec eslint . -f json -o artifacts/eslint.json
pnpm exec vitest run --reporter=json --outputFile=artifacts/vitest.json
Get-FileHash artifacts/*.json -Algorithm SHA256`,
      `artifacts/eslint.json SHA256 11A0...
artifacts/vitest.json SHA256 5F71...
报告带命令版本与提交号归档，失败时可以比较同一门禁前后结果。`,
    ),
  ],
  [jsName(j5Stage, 'Vitest 单测与 Playwright 端到端')]: [
    jsExample(
      '按风险划分单元、集成与浏览器层',
      'Test strategy',
      `// package.json scripts
{
  "test:unit": "vitest run src/lib",
  "test:integration": "vitest run src/adapters",
  "test:e2e": "playwright test",
  "verify": "pnpm test:unit && pnpm test:integration && pnpm test:e2e"
}

// 快速失败顺序
pnpm test:unit
pnpm test:integration
pnpm test:e2e`,
      `Test Files  14 passed (14)
Tests       86 passed (86)
14 passed (12.4s)
纯逻辑、适配器和用户流程分层运行，失败时先定位最小风险面。`,
    ),
    jsExample(
      '单元测试注入时间与依赖',
      'Vitest',
      `import { expect, it, vi } from 'vitest';

it('marks an expired session without waiting', () => {
  vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
  const clock = { now: () => Date.now() };
  const session = { expiresAt: new Date('2026-11-24T09:59:00Z').getTime() };
  expect(session.expiresAt < clock.now()).toBe(true);
  vi.useRealTimers();
});`,
      `✓ marks an expired session without waiting
Test Files  1 passed (1)
Tests       1 passed (1)
测试结果与机器真实时间无关，边界时间可以精确复现。`,
    ),
    jsExample(
      'Playwright 使用角色与名称定位',
      'Playwright',
      `import { expect, test } from '@playwright/test';

test('reserves an order', async ({ page }) => {
  await page.goto('/orders/new');
  await page.getByLabel('商品编码').fill('SKU-42');
  await page.getByLabel('数量').fill('2');
  await page.getByRole('button', { name: '提交订单' }).click();
  await expect(page.getByRole('heading', { name: '订单已创建' })).toBeVisible();
  await expect(page.getByTestId('order-id')).toContainText('O-');
});`,
      `1 passed
定位依赖用户可感知的 label、button 与 heading，而不是脆弱的 CSS 层级。`,
    ),
    jsExample(
      '每个浏览器上下文创建独立存储与网络',
      'Playwright',
      `import { expect, test } from '@playwright/test';

test('does not leak a previous tenant', async ({ browser }) => {
  const first = await browser.newContext();
  const pageA = await first.newPage();
  await pageA.goto('/login');
  await pageA.evaluate(() => localStorage.setItem('tenant', 'A'));

  const second = await browser.newContext();
  const pageB = await second.newPage();
  await pageB.goto('/login');
  await expect(pageB.evaluate(() => localStorage.getItem('tenant'))).resolves.toBeNull();
  await first.close();
  await second.close();
});`,
      `1 passed
两个 context 的 localStorage、cookie 与网络路由互不共享，租户污染被隔离。`,
    ),
    jsExample(
      '失败时保留 trace 与时间线',
      'Playwright',
      `// playwright.config.js
export default {
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
};

// 执行：pnpm exec playwright test --trace=retain-on-failure`,
      `1 failed
trace.zip saved
screenshot.png saved
报告包含网络、快照、控制台与每一步耗时，可直接定位失败环境和时序。`,
    ),
  ],
  [jsName(j5Stage, '模块化工程重构实验')]: [
    jsExample(
      '先输出依赖图和循环引用',
      'PowerShell',
      `pnpm exec madge src --extensions js --circular
pnpm exec madge src --extensions js --json > artifacts/deps.json
Get-Content artifacts/deps.json | ConvertFrom-Json | Select-Object -ExpandProperty circular`,
      `Processed 34 files
✖ Found 1 circular dependency
src/cart.js > src/pricing.js > src/cart.js
重构前先移除循环边，再移动业务代码。`,
    ),
    jsExample(
      '行为测试先冻结重构前契约',
      'Vitest',
      `import { expect, it } from 'vitest';
import { calculate } from './legacy-cart.js';

it('preserves cart output before moving code', () => {
  expect(calculate([{ price: 50, qty: 2 }], 'gold')).toEqual({
    subtotal: 100,
    discount: 20,
    total: 80,
  });
  expect(() => calculate([], 'vip')).toThrow('unsupported tier');
});`,
      `✓ preserves cart output before moving code
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
    jsExample(
      '领域层离开浏览器仍可运行',
      'Node.js ESM · 双文件',
      `// src/lib/pricing.js
export const tiers = Object.freeze({
  basic: (amount) => amount,
  gold: (amount) => amount >= 100 ? amount - 20 : amount,
});
export function quote(lines, tier) {
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const strategy = tiers[tier];
  if (!strategy) throw new RangeError('unsupported tier');
  return { subtotal, total: strategy(subtotal) };
}

// node 检查
import { quote } from './pricing.js';
console.log(quote([{ price: 60, qty: 2 }], 'gold'));`,
      `{ subtotal: 120, total: 100 }
领域模块不读取 DOM，Node 测试可独立导入并验证全部价格规则。`,
    ),
    jsExample(
      '依赖由入口注入而不是隐藏单例',
      'JavaScript',
      `export function createOrderService({ repository, clock, audit }) {
  for (const [name, value] of Object.entries({ repository, clock, audit })) {
    if (!value) throw new TypeError('missing dependency: ' + name);
  }
  return {
    async submit(input) {
      const createdAt = clock.now().toISOString();
      const order = await repository.save({ ...input, createdAt });
      audit.record({ type: 'order.created', id: order.id });
      return order;
    },
  };
}
const service = createOrderService({
  repository: { save: async (value) => ({ id: 'O-1', ...value }) },
  clock: { now: () => new Date('2026-11-24T00:00:00Z') },
  audit: { record: (event) => console.log(event) },
});
console.log(await service.submit({ amount: 100 }));`,
      `{ type: 'order.created', id: 'O-1' }
{ id: 'O-1', amount: 100, createdAt: '2026-11-24T00:00:00.000Z' }
时间和持久化都可在测试中替换。`,
    ),
    jsExample(
      '结构移动后重新做全链路验收',
      'PowerShell',
      `pnpm exec eslint . --max-warnings=0
pnpm exec vitest run
pnpm exec playwright test
pnpm build
Get-ChildItem dist/assets | Select-Object Name,Length`,
      `Tests  86 passed (86)
14 passed (9.8s)
vite v7.2.2 building for production...
index-B8d2.js 46210
index-A3c1.css 11880`,
    ),
  ],
  [jsName(j6Stage, '长任务、渲染与交互延迟')]: [
    jsExample(
      '把可感知指标绑定到真实交互',
      'Browser JavaScript',
      `const result = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    result.push({ name: entry.name, value: entry.value, id: entry.id });
  }
  console.log('LCP', result.at(-1));
}).observe({ type: 'largest-contentful-paint', buffered: true });
addEventListener('click', (event) => {
  const started = performance.now();
  queueMicrotask(() => {
    console.log('click handled in', Math.round(performance.now() - started), event.type);
  });
}, { once: true });
setTimeout(() => document.querySelector('main').click(), 10);`,
      `click handled in 0 click
LCP { name: '', value: 1824.3, id: 'hero-title' }
指标带可识别的页面元素或交互名称，才能和用户动作对照。`,
    ),
    jsExample(
      '从性能追踪中定位主线程热点',
      'Chrome DevTools',
      `// 控制台开始记录
console.profile('checkout');
document.querySelector('#checkout').click();
setTimeout(() => {
  console.profileEnd('checkout');
  console.log('profile complete: inspect flame chart');
}, 1000);

// 或在命令行：
node --cpu-prof --cpu-prof-dir=artifacts perf.mjs`,
      `profile complete: inspect flame chart
artifacts/CPU.20261124.101500.1234.0.001.cpuprofile
追踪中长条调用栈优先定位到计算或同步布局任务。`,
    ),
    jsExample(
      '拆分读写避免布局抖动',
      'Browser JavaScript',
      `const rows = [...document.querySelectorAll('[data-row]')];
const heights = [];
for (const row of rows) {
  heights.push(row.getBoundingClientRect().height);
}
for (const [index, row] of rows.entries()) {
  row.style.height = heights[index] + 2 + 'px';
}
console.log('read pass', heights.length);
console.log('write pass', rows.length);
console.log('single reflow boundary after writes');`,
      `read pass 120
write pass 120
single reflow boundary after writes
先集中读取尺寸再集中写入，循环内交替读写会强制浏览器重复布局。`,
    ),
    jsExample(
      '只渲染进入视口附近的内容',
      'Browser JavaScript',
      `const rows = [...document.querySelectorAll('[data-lazy]')];
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const row = entry.target;
    row.textContent = row.dataset.lazy;
    observer.unobserve(row);
  }
}, { rootMargin: '200px' });
for (const row of rows) observer.observe(row);
console.log('observing', rows.length);
console.log('hydrated on intersection only');`,
      `observing 500
hydrated on intersection only
已离开视口的 470 行仍保持轻量占位，滚动到附近时才填充内容。`,
    ),
    jsExample(
      '把性能预算写入回归门槛',
      'Vitest + Playwright',
      `import { expect, test } from '@playwright/test';

test('interactive checkout stays within budget', async ({ page }) => {
  await page.goto('/checkout');
  const duration = await page.evaluate(async () => {
    const start = performance.now();
    document.querySelector('#pay').click();
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  });
  expect(duration).toBeLessThan(200);
  console.log('interaction budget', Math.round(duration));
});`,
      `1 passed
interaction budget 84
预算固定为发布条件，超出时测试失败并保留真实机器上的持续时间。`,
    ),
  ],
  [jsName(j6Stage, '包体、代码分割和缓存')]: [
    jsExample(
      '读取构建清单定位首屏下载',
      'Vite + PowerShell',
      `pnpm build
Get-Content dist/.vite/manifest.json | ConvertFrom-Json |
  ConvertTo-Json -Depth 8
Get-ChildItem dist/assets -Filter '*.js' |
  Sort-Object Length -Descending |
  Select-Object -First 5 Name,Length`,
      `index-C31.js 182340
vendor-chart-D8a.js 96420
report-A12.js 42300
首屏入口与图表懒加载块可以分别设置预算。`,
    ),
    jsExample(
      '动态导入把报表移出首屏',
      'Browser JavaScript',
      `const openButton = document.querySelector('#open-report');
openButton.addEventListener('click', async () => {
  openButton.disabled = true;
  try {
    const { renderReport } = await import('./report.js');
    const requests = performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes('report-'));
    console.log('report chunks', requests.length);
    renderReport(document.querySelector('#report'));
  } finally {
    openButton.disabled = false;
  }
});`,
      `report chunks 2
报表模块和图表依赖在当前点击后才请求，首屏入口不包含它们的成本。`,
    ),
    jsExample(
      '按稳定功能边界配置代码分块',
      'Vite + PowerShell',
      `// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/chart.js/')) return 'chart';
          if (id.includes('/src/features/report/')) return 'report';
          if (id.includes('/node_modules/')) return 'vendor';
          return undefined;
        },
      },
    },
  },
};

// 执行：pnpm build`,
      `dist/assets/chart-C2a.js 96211
dist/assets/report-B8d.js 42310
dist/assets/vendor-A7c.js 81220
分块围绕功能与升级频率，避免每次业务改动都使大依赖缓存失效。`,
    ),
    jsExample(
      '内容哈希配合长期缓存',
      'HTTP headers',
      `Cache-Control: public, max-age=31536000, immutable
ETag: "9a12f3c4"

# 入口 HTML
Cache-Control: no-cache

# 带哈希资源
/assets/index-C31.js
/assets/report-A12.js`,
      `入口每次重新验证，拿到最新哈希；
带哈希资源可在一年内直接复用缓存；
发布新版本后 URL 改变，不会读到旧模块。`,
    ),
    jsExample(
      '发布后验证缓存命中与更新',
      'PowerShell',
      `$index = Invoke-WebRequest https://www.example.test/
$asset = ($index.Content | Select-String -AllMatches '/assets/[^"]+\\.js').Matches[0].Value
Invoke-WebRequest "https://www.example.test$asset" -Headers @{ 'Cache-Control'='max-age=0' }
Invoke-WebRequest "https://www.example.test$asset" | Select-Object StatusCode,Headers
Invoke-WebRequest https://www.example.test/ | Select-Object StatusCode`,
      `StatusCode 200
x-cache: HIT
content-type: text/html; charset=utf-8
入口返回 200，资源第二次请求命中 CDN，哈希 URL 与当前 index 一致。`,
    ),
  ],
  [jsName(j6Stage, 'XSS、第三方脚本与 CSP')]: [
    jsExample(
      '沿不可信数据流找到执行汇聚点',
      'Browser JavaScript',
      `const params = new URLSearchParams(location.search);
const name = params.get('name') ?? '';
const container = document.querySelector('#welcome');
// 危险汇聚：字符串被解析成 HTML
container.innerHTML = '<p>欢迎 ' + name + '</p>';
console.log('rendered html', container.innerHTML);
console.log('script count', container.querySelectorAll('script').length);`,
      `rendered html <p>欢迎 <img src=x onerror=alert(1)></p>
script count 0
查询参数直接进入 innerHTML，浏览器会创建带事件处理器的元素。`,
    ),
    jsExample(
      '安全 DOM API 在输出点编码文本',
      'Browser JavaScript',
      `const params = new URLSearchParams(location.search);
const name = params.get('name') ?? '';
const container = document.querySelector('#welcome');
const paragraph = document.createElement('p');
paragraph.textContent = '欢迎 ' + name;
container.replaceChildren(paragraph);
console.log('text', container.textContent);
console.log('elements', container.querySelectorAll('*').length);
console.log('images', container.querySelectorAll('img').length);`,
      `text 欢迎 <img src=x onerror=alert(1)>
elements 1
images 0
输入被当作字符写入文本节点，不会被解析成可执行 HTML。`,
    ),
    jsExample(
      'CSP 缩小脚本执行面',
      'HTTP Content-Security-Policy',
      `Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-r4nd0m';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';

<!-- 页面脚本 -->
<script nonce="r4nd0m" type="module" src="/assets/app-C31.js"></script>`,
      `inline onerror handler blocked
eval blocked by script-src
script nonce accepted
浏览器报告 CSP violation，合法入口按 nonce 加载。`,
    ),
    jsExample(
      '第三方脚本按固定版本和最小权限接入',
      'HTML',
      `<script
  src="https://cdn.example.test/analytics-1.8.2.min.js"
  integrity="sha384-REPLACE_WITH_REAL_HASH"
  crossorigin="anonymous"
  defer
></script>

<!-- 页面侧只暴露排队函数，不传 token 与用户正文 -->
<script type="module">
  window.analyticsQueue ||= [];
  window.analyticsQueue.push({ event: 'page_view' });
</script>`,
      `1 script request blocked on integrity mismatch
integrity hash accepted after release verification
第三方包固定在 1.8.2，内容变化会在执行前被 SRI 拒绝。`,
    ),
    jsExample(
      '浏览器回归证明载荷没有执行',
      'Playwright',
      `import { expect, test } from '@playwright/test';

test('escapes the search parameter', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto('/search?name=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(dialogs).toEqual([]);
});`,
      `1 passed
文本按原样可见，页面中不存在 img[src="x"]，dialog 事件数量为 0。`,
    ),
  ],
  [jsName(j6Stage, '错误边界、日志和真实用户监控')]: [
    jsExample(
      '收集同步异常与未处理拒绝',
      'Browser JavaScript',
      `const events = [];
addEventListener('error', (event) => {
  events.push({ type: 'error', message: event.message, source: event.filename });
});
addEventListener('unhandledrejection', (event) => {
  events.push({ type: 'rejection', reason: String(event.reason) });
});
Promise.reject(new Error('load failed'));
setTimeout(() => console.log(events), 0);`,
      `[ { type: 'rejection', reason: 'Error: load failed' } ]
同步异常与 Promise 拒绝来自不同入口，监控必须同时注册。`,
    ),
    jsExample(
      '日志携带版本请求与构建号',
      'Browser JavaScript',
      `const context = {
  appVersion: '2026.11.24',
  buildId: document.querySelector('meta[name="build-id"]').content,
  requestId: crypto.randomUUID(),
  route: location.pathname,
};
function report(level, message, detail = {}) {
  console.log(JSON.stringify({ level, message, ...context, ...detail }));
}
report('info', 'checkout started', { cartSize: 2 });
report('error', 'payment failed', { code: 'CARD_DECLINED' });`,
      `{"level":"info","message":"checkout started","buildId":"c31a","cartSize":2}
{"level":"error","message":"payment failed","buildId":"c31a","code":"CARD_DECLINED"}
同一版本、路由和请求 ID 可串起发布后的完整故障链。`,
    ),
    jsExample(
      '在离开浏览器前完成脱敏和截断',
      'Browser JavaScript',
      `function sanitize(record) {
  const copy = structuredClone(record);
  for (const key of ['password', 'token', 'authorization', 'email']) {
    if (key in copy) copy[key] = '[redacted]';
  }
  copy.message = String(copy.message ?? '').slice(0, 200);
  copy.stack = String(copy.stack ?? '').slice(0, 2000);
  return copy;
}
const payload = sanitize({
  message: 'login failed',
  token: 'secret-value',
  email: 'ada@example.test',
  stack: 'x'.repeat(3000),
});
console.log(payload.message, payload.token);
console.log('stack length', payload.stack.length);`,
      `login failed [redacted]
stack length 2000
秘密和邮箱在上报前被替换，长堆栈不会突破事件大小限制。`,
    ),
    jsExample(
      '把真实用户指标按发布版本聚合',
      'Browser JavaScript',
      `import { onCLS, onINP, onLCP } from 'web-vitals';

const metricRows = [];
function send(metric) {
  metricRows.push({ name: metric.name, value: metric.value, id: metric.id });
  console.log('metric', metricRows.at(-1));
}
onCLS(send);
onINP(send);
onLCP(send);
console.log('version', document.documentElement.dataset.build);`,
      `metric { name: 'LCP', value: 1824.4, id: 'v5-123' }
metric { name: 'CLS', value: 0.04, id: 'v5-124' }
version 2026.11.24-c31a`,
    ),
    jsExample(
      '告警落到停止发布与回滚动作',
      'PowerShell',
      `$query = @{
  route = '/checkout'
  release = $env:RELEASE_ID
  window = '5m'
  threshold = 0.05
}
$errorRate = ./ops/query-error-rate.ps1 @query
if ($errorRate -gt $query.threshold) {
  ./ops/set-weight.ps1 -Release $env:PREVIOUS_RELEASE -Percent 100
  Write-Output "rollback triggered errorRate=$errorRate"
} else {
  Write-Output "release healthy errorRate=$errorRate"
}`,
      `rollback triggered errorRate=0.081
previous release active at 100 percent
告警不只是发消息，而是有阈值、负责人和可执行回滚步骤。`,
    ),
  ],
  [jsName(j6Stage, '静态站点、CDN 与环境配置')]: [
    jsExample(
      '部署子路径写入构建基址',
      'Vite + PowerShell',
      `// vite.config.js
export default {
  base: '/app/javascript/',
  build: { outDir: 'dist' },
};

// 验证
pnpm build
Select-String -Path dist/index.html -Pattern '/app/javascript/assets/'`,
      `<script type="module" src="/app/javascript/assets/index-C31.js"></script>
<link rel="stylesheet" href="/app/javascript/assets/index-A12.css">
页面和资源都从部署子路径请求，不会落到站点根。`,
    ),
    jsExample(
      '路由回退不吞静态资源错误',
      'Nginx',
      `location /app/ {
  try_files $uri $uri/ /app/index.html;
}

location /app/assets/ {
  try_files $uri =404;
  add_header Cache-Control "public, max-age=31536000, immutable";
}`,
      `GET /app/orders/42 -> 200 index.html
GET /app/assets/missing-C31.js -> 404
页面路由得到回退，缺失的带哈希资源仍返回 404 以暴露发布不完整。`,
    ),
    jsExample(
      '缓存与安全响应头一起验收',
      'PowerShell',
      `$response = Invoke-WebRequest https://www.example.test/app/
$response.Headers['Cache-Control']
$response.Headers['Content-Security-Policy']
$response.Headers['X-Content-Type-Options']
$response.Headers['Referrer-Policy'])

# 资源请求
Invoke-WebRequest https://www.example.test/app/assets/index-C31.js |
  Select-Object StatusCode,Headers`,
      `no-cache
default-src 'self'; script-src 'self'
nosniff
strict-origin-when-cross-origin
StatusCode 200, cache-control immutable`,
    ),
    jsExample(
      '构建环境固化并写入可审计版本',
      'PowerShell',
      `$env:VITE_API_BASE='https://api.example.test'
$buildId = (git rev-parse --short HEAD).Trim()
$env:VITE_BUILD_ID=$buildId
pnpm build
@{
  buildId = $buildId
  apiBase = $env:VITE_API_BASE
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content dist/release.json
Get-Content dist/release.json`,
      `{
  "buildId": "c31a9f2",
  "apiBase": "https://api.example.test",
  "createdAt": "2026-11-24T10:30:00.0000000Z"
}`,
    ),
    jsExample(
      '发布冒烟通过后再放量',
      'PowerShell',
      `./deploy/upload.ps1 -Path dist -Version $env:RELEASE_ID
./deploy/set-weight.ps1 -Release $env:RELEASE_ID -Percent 5
$home = Invoke-WebRequest https://www.example.test/app/
$asset = Invoke-WebRequest https://www.example.test/app/assets/index-C31.js
if ($home.StatusCode -ne 200 -or $asset.StatusCode -ne 200) {
  ./deploy/set-weight.ps1 -Release $env:PREVIOUS_RELEASE -Percent 100
  throw 'smoke failed'
}
./deploy/set-weight.ps1 -Release $env:RELEASE_ID -Percent 100`,
      `upload complete release=2026.11.24-c31a
weight changed to 5 percent
home 200 asset 200
weight changed to 100 percent`,
    ),
  ],
  [jsName(j6Stage, 'JavaScript 企业应用毕业项目')]: [
    jsExample(
      '把范围与验收标准冻结成可执行清单',
      'Node.js',
      `import assert from 'node:assert/strict';

const acceptance = {
  flows: ['search', 'filter', 'save', 'cancel'],
  quality: { unit: 0.8, e2e: 1, maxLcpMs: 2500 },
  security: ['escape-text', 'protocol-allowlist', 'csp'],
};
assert.equal(new Set(acceptance.flows).size, 4);
assert.ok(acceptance.quality.maxLcpMs <= 2500);
assert.ok(acceptance.security.includes('csp'));
console.log('scope frozen', acceptance.flows.join(','));
console.log('quality gate', acceptance.quality);`,
      `scope frozen search,filter,save,cancel
quality gate { unit: 0.8, e2e: 1, maxLcpMs: 2500 }
清单可被脚本读取，任何新增范围都需要同步更新验收。`,
    ),
    jsExample(
      '语言机制用测试和运行证据落地',
      'Vitest',
      `import { expect, it } from 'vitest';
import { createSession } from './session.js';

it('proves isolation, cancellation and error chaining', async () => {
  const left = createSession('left');
  const right = createSession('right');
  left.cache.set('key', 'A');
  expect(right.cache.has('key')).toBe(false);

  const controller = new AbortController();
  const task = left.load(controller.signal);
  controller.abort(new DOMException('leave', 'AbortError'));
  await expect(task).rejects.toMatchObject({ name: 'AbortError' });
});`,
      `✓ proves isolation, cancellation and error chaining
Test Files  1 passed (1)
Tests       1 passed (1)`,
    ),
    jsExample(
      '质量与安全在一条流水线中验收',
      'PowerShell + Playwright',
      `pnpm exec eslint . --max-warnings=0
pnpm exec vitest run --coverage
pnpm exec playwright test
pnpm build
pnpm audit --prod --audit-level high
if ($LASTEXITCODE -ne 0) { throw 'release gate failed' }
Write-Output 'quality and security gates passed'`,
      `Coverage lines 84.2 percent
18 passed (16.4s)
No known vulnerabilities found
quality and security gates passed`,
    ),
    jsExample(
      '性能指标决定是否继续放量',
      'PowerShell',
      `$baseline = Get-Content artifacts/perf-baseline.json | ConvertFrom-Json
$current = ./ops/read-web-vitals.ps1 -Release $env:RELEASE_ID -Window '15m'
$lcpRegression = ($current.lcpP75 - $baseline.lcpP75) / $baseline.lcpP75
$inpRegression = ($current.inpP75 - $baseline.inpP75) / $baseline.inpP75
Write-Output "lcp=$lcpRegression inp=$inpRegression"
if ($lcpRegression -gt 0.1 -or $inpRegression -gt 0.1) {
  ./deploy/set-weight.ps1 -Release $env:PREVIOUS_RELEASE -Percent 100
  throw 'performance budget exceeded'
}`,
      `lcp=0.14 inp=0.03
weight changed to previous release at 100 percent
performance budget exceeded`,
    ),
    jsExample(
      '运行手册让另一位工程师完成启动与回滚',
      'Markdown runbook',
      `# JavaScript 应用运行手册
## 启动
- pnpm install --frozen-lockfile
- 配置 VITE_API_BASE 与发布凭据
- pnpm build && pnpm preview --port 4173
## 验证
- pnpm exec playwright test tests/smoke.spec.js
- 检查 /health、/app/ 与错误率面板
## 回滚
- ./deploy/set-weight.ps1 -Release $PREVIOUS_RELEASE -Percent 100
- 重新执行冒烟并确认错误率回落

// 演练：新人按本节从空环境启动并完成一次回滚`,
      `install passed
build passed
smoke passed
rollback completed in 3m12s
新人无需口头补充即可复现启动、验证和恢复步骤。`,
    ),
  ],
};

const withJavascriptExamples = (
  courses: readonly ProgrammingCourseSeed[],
): readonly ProgrammingCourseSeed[] =>
  courses.map((course) => ({
    ...course,
    steps: course.steps.map(([title, body, note, existing], index): ProgrammingStepSeed => {
      const example = existing ?? JAVASCRIPT_EXAMPLE_SETS[course.name]?.[index];
      return example
        ? [title, body, note, example] as const
        : [title, body, note] as const;
    }),
  }));

export const HANDWRITTEN_JAVASCRIPT_J0_COURSES = withJavascriptExamples(JAVASCRIPT_J0_BASE);
export const HANDWRITTEN_JAVASCRIPT_J1_COURSES = withJavascriptExamples(JAVASCRIPT_J1_BASE);
export const HANDWRITTEN_JAVASCRIPT_J2_COURSES = withJavascriptExamples(JAVASCRIPT_J2_BASE);
export const HANDWRITTEN_JAVASCRIPT_J3_COURSES = withJavascriptExamples(JAVASCRIPT_J3_BASE);
export const HANDWRITTEN_JAVASCRIPT_J4_COURSES = withJavascriptExamples(JAVASCRIPT_J4_BASE);
export const HANDWRITTEN_JAVASCRIPT_J5_COURSES = withJavascriptExamples(JAVASCRIPT_J5_BASE);
export const HANDWRITTEN_JAVASCRIPT_J6_COURSES = withJavascriptExamples(JAVASCRIPT_J6_BASE);
