// Vue 3 · 逐课手写教案
// 课程名必须与 programs.ts 根据 language-catalogs.ts 生成的名称完全一致。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed, ProgrammingStepSeed } from '../shared.js';

const track = 'P14 · 独立语言课程' as const;
const vueName = (stage: string, topic: string) => `Vue 3 · ${stage}：${topic}`;

// ── V0 Vue、Vite 与第一个应用 ────────────────────────────────────────────────
const v0Stage = 'Vue、Vite 与第一个应用';

const VUE3_V0_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: vueName(v0Stage, 'Vue 与 Vite 的职责边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 36,
    prerequisite: '已能阅读 ES Module，并在终端执行 pnpm 与 node 命令。',
    goal: '区分 Vue 运行时、响应式系统、模板编译与 Vite 开发构建链路，能够解释一次源码修改为何先经 dev server 再触发页面更新。',
    guidedPractice: '在最小 Vue 项目中分别打开 vite.config.ts、main.ts 与 App.vue，执行 pnpm dev，修改模板和 CSS 观察 HMR 更新；再运行 pnpm build 检查 dist 中的 JS、CSS 和 index.html。',
    independentPractice: '画出一张从浏览器请求 index.html 到 Vue 挂载组件、再到 Vite 构建产物的链路图，并为开发态与生产态各标注一组实际命令、输入文件和输出证据。',
    commonErrors: [
      '把 Vite 当成 Vue 的渲染器，误以为响应式更新由 Vite 完成。',
      '在源码里引用只在开发服务器存在的虚拟模块，生产构建时才暴露解析错误。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Creating an Application. https://vuejs.org/guide/essentials/application.html',
      'Vite Guide: Why Vite. https://vite.dev/guide/why.html',
    ],
    steps: [
      ['七层职责拆开', 'Vue 包里同时包含响应式、运行时和编译相关能力；浏览器执行 createApp 后，由 runtime-dom 把虚拟节点渲染成 DOM，依赖变化再进入调度更新。Vite 负责开发服务器、模块转换和依赖预构建，生产构建把入口及其依赖打包成静态文件。把两者混为一层时，HMR 正常但构建失败的边界就无法定位；验证时同时保留浏览器 Network、Vite 终端日志和 dist 产物。', '运行时与构建器分层'],
      ['开发请求链路', '打开页面时浏览器先取 index.html，其中 type=module 的入口再请求 /src/main.ts。Vite 按需转换 .vue 文件，把 template 编译为渲染函数、把 style 作为独立模块注入页面，并利用 ESM 让浏览器只加载当前图谱。请求 404 或 MIME 错误通常说明入口路径或插件转换有误；用 Network 面板查看原始 URL、响应头和模块依赖即可复现。', '看请求而不是只看白屏'],
      ['HMR 与整页刷新', 'HMR 的目标是替换发生变化的模块并保留尽可能多的运行状态。Vue 单文件组件更新时，模板或样式模块被重新加载，已有组件状态可能继续存在；修改入口、插件配置或无法边界替换的模块则触发 reload。若出现重复定时器、旧事件监听或状态突然消失，应检查模块是否在热替换时清理副作用，而不是把 reload 当作正确行为。', '区分热替换与重载'],
      ['构建期与运行期', '生产构建会压缩代码、拆分资源和生成带哈希的文件，运行期只负责浏览器中的 Vue 应用。import.meta.env 中的变量在构建时替换，因此不能把服务端秘密写进 VITE_ 前缀变量；动态请求路径、权限和密钥读取仍应留在服务端。构建通过但页面请求失败时，应比对构建 base、静态资源路径和部署目录，不能用开发服务器结果替代部署验证。', '构建时信息不是运行秘密'],
      ['一条证据链验收', '完成一张可复核的职责表：源码文件、转换者、运行位置、输出物和失败现象各占一列。用 pnpm dev 验证 HMR 是否保留局部状态，用 pnpm build 验证模块解析，再用 pnpm preview 验证 dist 的静态资源不依赖开发服务器。三个动作都通过后，还要在网络被阻断时确认静态页面应有的失败提示，而不是无声停在加载中。', '开发构建预览三层验证'],
    ],
  },
  {
    name: vueName(v0Stage, '从空目录创建入口和根组件'),
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '知道 HTML 文档如何加载普通 script，并会使用 TypeScript 的基本类型。',
    goal: '能从空目录建立 Vite 入口、Vue 根组件与挂载节点，理解 createApp 的挂载流程以及入口职责。',
    guidedPractice: '新建空目录后只创建 index.html、src/main.ts 和 src/App.vue，写入带 id app 的 div、createApp(App).mount 与根组件模板，安装 vue/vite 后执行开发启动并检查控制台。',
    independentPractice: '删除脚手架生成的辅助文件，从零重建同一入口，再故意把挂载选择器改成不存在节点，记录 Vue 警告、页面现象与修复Diff。',
    commonErrors: [
      '在挂载元素出现前执行 mount，导致选择器返回 null。',
      '把根组件挂到多个尚未清理的应用实例上，页面出现重复内容。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Application API. https://vuejs.org/api/application.html',
      'Vite Guide: Getting Started. https://vite.dev/guide/',
    ],
    steps: [
      ['最小文件清单', 'Vite 首页由项目根的 index.html 作为入口，它通过 script type=module 指向 src/main.ts；main.ts 引入根组件并调用 createApp(App).mount(#app)。App.vue 只承载根模板与样式，不应在这里读取 URL、初始化全站状态或发起所有业务请求。文件职责清楚后，入口替换、测试挂载和服务端预渲染才有稳定边界；任何入口 404 都先查根目录和 script src。', 'HTML 是入口图起点'],
      ['createApp 的挂载', 'createApp(App) 创建独立应用上下文，mount 接收宿主元素或选择器，首次渲染时把根组件的虚拟节点转换为真实 DOM。应用上下文保存全局组件、插件、错误处理器和 provide 值，因此同页多个应用彼此隔离。挂载节点不存在会得到 null 相关错误，节点内已有内容默认也不能作为应用状态来源；验证时清空 #app 后重挂载并观察 DOM 的所有权。', '应用上下文独立'],
      ['入口只做装配', 'main.ts 适合导入全局样式、注册路由与 Pinia、安装错误监控，然后调用 mount。业务数据应由路由页面或组合函数获取，避免入口在每次刷新时发送不可取消的请求。若插件初始化需要异步数据，应在挂载前完成并处理失败，或把加载状态放进根组件；否则 SSR、测试和微前端接入都会遇到隐式时序依赖。', '入口负责装配而非业务'],
      ['挂载节点契约', 'index.html 中的挂载节点需要稳定 id，生产 SSR 时它还会接收服务端生成的 HTML 和序列化数据。不要在脚本运行时用字符串拼接整段应用 HTML，也不要把用户输入写进宿主容器。开发时可先渲染一个带组件名的根节点，再逐层增加子组件；如果页面白屏，先看 mount 返回值、控制台警告与 #app 的 outerHTML。', '宿主节点要稳定可检查'],
      ['重建与失败验证', '从空目录重建时每加一个文件就刷新一次：先确认 HTML 可访问，再确认入口模块无 404，最后确认根组件文本出现。把挂载选择器临时改错，应看见明确警告而非空白假象；修复后比较 DOM 结构是否只挂载一次。测试环境还要用 createApp 的 unmount 清理实例，防止多个用例共享同一宿主节点。', '每层增加后立刻验证'],
    ],
  },
  {
    name: vueName(v0Stage, 'SFC、script setup 与 scoped CSS'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能写普通 Vue 模板，并知道 TypeScript 的类型注解与 import。',
    goal: '掌握单文件组件三个块的编译关系，能够使用 script setup 暴露模板状态，并解释 scoped CSS 的属性选择器边界。',
    guidedPractice: '把一个组件改写为 script setup lang=ts，加入顶层 ref、import 与 computed，再写两段 scoped 样式；用开发工具检查根节点 data-v 属性，并尝试在父组件中覆盖子组件内部标题。',
    independentPractice: '制作一个会显示状态与按钮的 SFC，分别用普通 style 和 scoped style 命中同一类名，记录选择器与哈希属性差异，并给出避免全局样式泄漏的写法。',
    commonErrors: [
      '在 script setup 中声明变量后忘记模板可以直接使用，反而绕到 setup 返回值。',
      '认为 scoped 会阻止所有样式穿透，实际上子组件根节点仍可能被父样式命中。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Single-File Components. https://vuejs.org/guide/scaling-up/sfc.html',
      'Vue 3 Documentation: script setup. https://vuejs.org/api/sfc-script-setup.html',
      'Vue 3 Documentation: SFC CSS Features. https://vuejs.org/api/sfc-css-features.html',
    ],
    steps: [
      ['三个块各自编译', '一个 .vue 文件由 template、script 和 style 组成，构建插件把它们拆开交给不同编译器：模板转成渲染函数，脚本保留模块语义，样式生成可注入或提取的 CSS。script setup 的顶层绑定会在编译期暴露给模板，无需 return 对象。若出现模板变量未定义，应同时检查拼写、导入和编译后模块，而不是在运行时给 window 挂变量。', '绑定由编译器暴露'],
      ['script setup 的边界', '顶层 await 会把组件变成异步依赖，模板只在异步 setup 完成后渲染；defineProps、defineEmits 这类宏无需 import，也不能在普通函数中动态调用。普通组合函数可以返回 ref、computed 和函数，再在 setup 顶层解构使用。把顶层 await 放进每个小组件会延迟边界，验证时查看 Suspense 或父级 loading 行为，并确保异常有错误边界。', '宏是编译期约束'],
      ['scoped 不是隔离沙箱', 'scoped 样式会为组件模板节点加 data-v 哈希属性，再把选择器改成属性组合，因此同一类名在不同组件中通常互不覆盖。子组件根节点会同时带上父组件和子组件作用域，父样式可能命中它；深层控制应通过公开 class、CSS 变量或 :deep 明确表达。用 DevTools 查看节点属性和最终 CSS 规则，才能判断命中来自哪个作用域。', '看属性与最终规则'],
      ['样式顺序与全局入口', 'scoped 只改变选择器，不会隔离 CSS 变量、字体族和全局重置。多个组件引入相同基础样式时，最终顺序仍会影响层叠；全局主题应放在入口样式层，组件只消费变量。样式加载失败可能表现为整页无 CSS，而非组件报错，因此构建后要检查 CSS 文件是否被引用、哈希是否变化，并在预览环境验证首屏样式没有闪烁。', '变量与层叠跨作用域'],
      ['生产构建检查', '构建后确认脚本、样式和模板产物都进入资源图，检查 source map 是否按发布策略生成。把 scoped 类名改为同名类，在组件测试或浏览器中断言父组件标题不受影响；再用只读样式检查确认点击态与焦点态仍可见。若 CSS 被拆成异步块，加载失败时应有可读页面，而不是把交互按钮渲染成无样式裸元素。', '提取产物也要验证'],
    ],
  },
  {
    name: vueName(v0Stage, '模板表达式、绑定和事件'),
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '会写 Vue 插值与 v-if，理解 DOM 属性和事件监听的基本概念。',
    goal: '能区分插值、属性绑定、class/style 绑定与事件处理，写出无副作用且可验证的模板交互。',
    guidedPractice: '在一个计数器组件中分别使用 {{ count }}、:aria-label、:class 与 @click，添加 .prevent、.stop 或 .once 观察事件修饰符效果，再用键盘 Enter 触发同一业务动作。',
    independentPractice: '为搜索框添加输入绑定、清空按钮和无结果提示，要求模板表达式不直接发请求，所有状态变化都能通过组件测试或浏览器事件复现。',
    commonErrors: [
      '在模板插值中调用会修改状态或发请求的函数，渲染次数变化导致重复副作用。',
      '把 DOM 属性、HTML attribute 和组件 prop 当成完全相同的绑定目标。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Template Syntax. https://vuejs.org/guide/essentials/template-syntax.html',
      'Vue 3 Documentation: Event Handling. https://vuejs.org/guide/essentials/event-handling.html',
    ],
    steps: [
      ['插值是纯表达式', '{{ }} 中的内容在渲染时求值，结果被转义后写入文本节点；它可以访问 setup 暴露的 ref、computed 和方法，但每次依赖变化都可能重新执行。因此表达式应保持纯函数，不能在这里写 localStorage.setItem 或 fetch。若渲染后请求数量翻倍，可先在方法中打断点或用 Vue DevTools 的组件事件记录，再把副作用移到生命周期或显式事件中。', '渲染表达式不要写副作用'],
      ['v-bind 与组件 prop', 'v-bind:title 绑定的是 DOM 或组件接收的属性，简写为 :title；布尔属性和空值有特殊序列化规则，disabled=false 与实际生成字符串并不等价。绑定组件时先看声明的是 prop、attribute 还是 emit 事件，未知属性可能落到根节点。用 Elements 面板核对最终 attribute，用组件 props 面板核对接收值，两者不一致就是边界找错了。', 'DOM 属性与 prop 分开看'],
      ['class 与 style 合并', ':class 支持对象、数组和字符串，最终会静态 class 合并；重复键由对象条件决定而非样式优先级。:style 对象适合运行时尺寸和变量，静态主题应放 CSS 类，避免每次渲染创建大量内联对象。样式“没生效”时要检查属性是否为空串、变量是否有单位以及 scoped 选择器是否命中，不能只改 !important 掩盖层叠问题。', '动态样式要控制来源'],
      ['事件与修饰符', '@click=handler 传入函数引用时由 Vue 绑定监听器，@click=handler() 会在渲染期立即执行，这是常见错误。修饰符 .prevent 对应 preventDefault，.stop 对应 stopPropagation，.once 只调用一次；键盘事件还应处理 keydown 与重复触发。测试时用 trigger 发送事件并断言 emit 或 DOM 状态，不要只检查 JS 内部变量。', '事件参数与修饰符要分清'],
      ['键盘与可观察结果', '按钮应使用原生 button，链接应使用 a，避免给 div 添加 role=button 后遗漏 Space、Enter 和焦点样式。输入框的 label 必须关联并给出错误提示的 aria-describedby。验收时用 Tab 找到控件、按 Enter 或 Space 触发动作、用屏幕阅读器检查名称，再在组件测试中断言事件次数与状态文字，确保行为不是只用鼠标偶然可用。', '事件最终要能被辅助技术触发'],
    ],
  },
  {
    name: vueName(v0Stage, '开发服务器、构建产物与预览'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能启动 Vite 开发服务器，知道 package.json 中的 scripts 字段。',
    goal: '理解 Vite 开发服务的按需加载、依赖预构建与生产构建输出，能够用 preview 和资源检查区分开发态与部署态问题。',
    guidedPractice: '执行 pnpm dev、pnpm build、pnpm preview，比较三者的端口、文件来源和 Network 请求；查看 dist/index.html 的 script、CSS 与哈希资源，再修改 base 配置观察资源路径变化。',
    independentPractice: '为一个带图片和懒加载路由的应用建立发布清单，记录构建产物大小、入口资源、缓存头和一条故意写错的静态路径，并说明如何在预览环境中确认修复。',
    commonErrors: [
      '把 Vite preview 当成生产服务器，忽略它的静态服务与代理行为并不等同于正式部署。',
      '只看构建成功，不检查 index.html 的资源引用和部署子路径。',
    ],
    sourceRefs: [
      'Vite Guide: Build. https://vite.dev/guide/build.html',
      'Vite Guide: Static Asset Handling. https://vite.dev/guide/assets.html',
      'Vite Guide: Command Line Interface. https://vite.dev/guide/cli.html',
    ],
    steps: [
      ['开发服务器的按需转换', 'pnpm dev 启动的开发服务器并不一次性打包全部源码，浏览器请求某个模块时，Vite 才转换该模块并返回 ESM。依赖预构建把大量 CommonJS 包整理成浏览器可缓存的 ESM 块，所以首次启动和新增依赖后可能看到 optimize deps 日志。模块 500 或依赖被重新优化时，先看终端堆栈和 Network 请求 URL，不要只看浏览器白屏。', '按需转换依赖预构建'],
      ['生产构建的入口图', 'pnpm build 从 index.html 和脚本入口收集静态依赖，生成 dist，文件名通常带内容哈希以便长期缓存。未出现在静态图中的运行时路径不会被自动打包，处理动态 URL 要用 new URL 等显式模式。构建成功不代表资源可用；打开 dist/index.html 检查 script 与 link、确认没有绝对开发路径，再在 preview 中请求每个关键资源。', '静态图只收集可分析依赖'],
      ['base 与部署目录', '应用部署在 /app/ 子路径时，Vite 的 base 必须与真实目录一致，否则 JS、CSS 和图片仍请求站点根。base 还会影响路由和资源 URL，不能只在本地修改 vite.config 后不重新构建。验证时从子路径直接打开、刷新深层链接并检查 Network；若 404 出现在静态资源而非 API，优先比对构建配置、服务器 rewrite 与 index.html 内容。', '子路径部署要全链路一致'],
      ['preview 的验证位置', 'vite preview 用于本地检查构建产物，默认静态服务并可能复用部分配置，但它不提供正式 CDN、反向代理、权限或缓存策略。通过 preview 只能证明产物在当前机器可被浏览器加载，正式部署还要验证 MIME、压缩、缓存头和 fallback。把 preview 地址误发到访问受限环境时，应同时记录服务器日志和资源响应状态。', '预览不是生产验收'],
      ['产物预算与失败回放', '在构建输出中记录入口 JS、主 CSS 和最大异步块，给每个文件设大小预算，再故意引入一个未被 tree-shake 的大依赖观察增量。发布前检查哈希是否变化、旧缓存是否会命中、source map 是否按策略保留。若资源加载失败，页面应显示可重试的可读错误而非永远加载；用离线模式或错误 URL 演练一次才能完成验收。', '大小缓存失败都留证据'],
    ],
  },
  {
    name: vueName(v0Stage, '第一个可测试 Vue 页面'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能运行项目脚本，并了解测试的 arrange、act、assert 三个基本阶段。',
    goal: '使用 Vitest 与 Vue Test Utils 编写第一个行为测试，能够判断测试失败来自组件行为、异步状态还是测试环境配置。',
    guidedPractice: '安装 Vitest、@vue/test-utils 与 jsdom，为一个带计数按钮的页面编写 mount 测试，使用 get 定位按钮、trigger 触发点击并断言文本，再故意改错选择器观察失败信息。',
    independentPractice: '给页面增加异步保存状态，使用 vi.fn 替换 API 客户端，补一个成功和一个失败用例，要求测试验证按钮禁用、提示文字与清理后的 loading 状态。',
    commonErrors: [
      '只断言组件实例内部 ref，不验证用户可见文本和交互结果。',
      '异步请求后在微任务完成前立即断言，导致测试偶发通过或失败。',
    ],
    sourceRefs: [
      'Vue Test Utils Guide. https://test-utils.vuejs.org/guide/',
      'Vitest Guide. https://vitest.dev/guide/',
    ],
    steps: [
      ['先定义可观察行为', '页面测试从用户能观察的结果出发：初始标题、按钮可用状态、点击后的计数和保存后的成功提示。mount 后先断言初始 DOM，再通过 get 找到可访问控件并 trigger，最后 flushPromises 等待异步链。只检查内部变量会让实现重构即失效，也抓不到模板未绑定状态的问题；失败输出应能指出具体文本和选择器。', '测试用户看到的结果'],
      ['组件与页面边界', '纯组件测试可以只传最小 props 并断言 emit；页面测试需要装配路由、Pinia 或 API mock。把 store 与请求都真实启动会让单个测试变慢且互相污染，因此应在边界处替换：用 createTestingPinia 或显式 createPinia，用 mock 模块返回固定结果。每个用例结束恢复 mock 并卸载组件。', '边界替换而非全局真连'],
      ['异步与状态快照', '点击保存后可能经历同步禁用、Promise 请求、响应更新和 loading 复位，测试要按阶段断言而不是只看最终结果。用 await flushPromises 或 vi.waitFor 等待 DOM 稳定，避免固定 setTimeout。若 CI 偶发失败，记录调用顺序、mock 调用次数和当时的 DOM 文本，确认是测试等待错误还是组件真的存在竞态。', '等待状态而不是猜时间'],
      ['失败路径也算行为', 'API reject 后组件应恢复按钮、显示可读错误并允许重试；错误对象不能直接渲染成 undefined。用 mockRejectedValue 注入超时和 500，断言 aria-live 提示与按钮状态。对可取消请求还要测试竞态：先发请求 A 再发 B，确保 A 的结果不能覆盖 B。测试报告应保留每条断言对应的用户场景。', '错误与竞态要有用例'],
      ['收口到可重复运行', '在干净环境执行 pnpm test --run，确认不存在依赖浏览器全局的隐式条件；再让 CI 使用与本地相同 Node 版本和锁文件。若测试通过但预览页面失败，说明中间还缺浏览器或构建层验证。把测试命令、失败日志和修复前后截图放进课程产物，保证同学可按步骤复现，而不是只看到一个绿色勾。', '本地 CI 使用同一输入'],
    ],
  },
];

// ── V1 响应式、computed 与 watch ─────────────────────────────────────────────
const v1Stage = '响应式、computed 与 watch';

const VUE3_V1_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: vueName(v1Stage, 'ref、reactive 与响应式边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '已写过 setup 状态，知道 JavaScript 对象引用与原始值赋值的差异。',
    goal: '正确选择 ref 与 reactive，理解自动解包、代理边界和替换对象后的响应式追踪。',
    guidedPractice: '在组件中分别创建计数 ref、表单 reactive 和嵌套对象，打印脚本里的 .value 与代理对象；把 reactive 对象整体替换、解构到普通变量并修改，观察模板是否更新。',
    independentPractice: '把一段混用 ref/reactive 的表单状态重构为单一数据结构，为原始值、对象替换和数组更新各写一个行为断言，并解释每个 .value 出现的原因。',
    commonErrors: [
      '在模板里再写 ref.value，忽略模板顶层已自动解包。',
      '把 reactive 对象解构为普通变量后修改，原对象不再被追踪。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Reactivity Fundamentals. https://vuejs.org/guide/essentials/reactivity-fundamentals.html',
      'Vue 3 API: reactive. https://vuejs.org/api/reactivity-core.html#reactive',
    ],
    steps: [
      ['ref 保存任意值', 'ref 把值包在带 value 访问器的容器里，脚本中必须通过 count.value 读写，模板顶层会自动解包。基本类型只能安全地通过 ref 获得响应式，嵌套对象则会转成代理。ref 可以整体替换而不丢失追踪；接口响应映射到表单时，通常先接收新对象再赋给 ref。若 UI 不变，先确认代码是否修改了原始非响应式变量。', '原始值与整体替换用 ref'],
      ['reactive 代理对象', 'reactive 返回目标对象的 Proxy，属性读取进入依赖收集，写入进入触发。它适合一组需要整体操作的对象，但替换整个 reactive 变量会改变调用方对旧代理的引用，模板可能仍持有旧对象。对象中的嵌套引用是惰性代理；把属性取出到普通变量后，变量本身不是响应式。验证时应比较对象身份与模板结果，而非只看 console 值。', '代理身份变化要跟踪'],
      ['模板自动解包', '模板会把 setup 返回的 ref 自动解开，因此写 count 而不是 count.value；嵌套在普通对象或数组中的 ref 不会无条件解包，具体取决于容器位置。模板里误写 count.value 可能得到 undefined 或重复解包。用 Vue DevTools 查看 setup state 与渲染上下文，再对照模板插值即可定位；不要把自动解包规则扩散成全局约定。', '解包只在特定上下文'],
      ['解构与响应式丢失', 'const { name } = reactive(form) 得到的是当时读到的值，后续 form.name 变化不会自动更新普通变量。需要解构时需要 toRefs 或改为 getter/computed；函数参数也会丢失代理身份。若必须传递普通对象，调用方应在每次需要最新值时重新读取。用一个解构值与一个 toRefs 值做对照测试，可以直观看到差异。', '解构前先想追踪链'],
      ['边界实验与选型', '为同一表单分别实现 ref 对象与 reactive 对象，记录替换、数组 push、解构和传参四种操作后的渲染差异。数据需要整体替换或作为函数返回值时优先 ref；仅局部聚合且保持同一代理时可使用 reactive。无论选择哪种，都不要把代理对象直接塞进 localStorage 或跨 Worker 传递，序列化前要 toRaw 或构造纯数据。', '选型围绕替换与传递'],
    ],
  },
  {
    name: vueName(v1Stage, '依赖读取和写入通知'),
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '了解 Proxy 的基本拦截能力，能读懂简单的 Map 与 WeakMap 结构。',
    goal: '解释 Vue 响应式如何通过依赖收集和触发形成更新，能够区分读取、写入、删除及无关属性变化带来的影响。',
    guidedPractice: '用一个包含 name 与 age 的 reactive 对象，在 Vue DevTools 或日志中观察 computed/watch 的重新执行次数；分别修改 name、age 和新增属性，记录哪些依赖被触发。',
    independentPractice: '画出 target、depsMap、dep 与 effect 的关系图，并用手动 ref 实验说明为什么未被读取的属性变化不会触发当前副作用。',
    commonErrors: [
      '以为整个 reactive 对象任意属性变化都会更新所有组件。',
      '在副作用运行时通过条件分支跳过读取，导致依赖集合与预期不一致。',
    ],
    sourceRefs: [
      'Vue 3 源码: packages/reactivity/src/effect.ts. https://github.com/vuejs/core/blob/main/packages/reactivity/src/effect.ts',
      'Vue 3 Documentation: In-Depth Reactivity. https://vuejs.org/guide/extras/reactivity-in-depth.html',
    ],
    steps: [
      ['读取建立依赖', '响应式系统维护 targetMap，以对象为键找到属性依赖表，再以属性为键保存应该重新运行的 effect。组件渲染或 computed 运行时读取 proxy 属性，track 记录当前活动副作用；未读取的属性没有建立边。条件分支尤其关键，只有当前分支实际读取的键会进入依赖集合，分支切换后旧依赖也可能需要清理。', '读到什么才订阅什么'],
      ['写入触发调度', 'set 拦截器在值发生变化时调用 trigger，找到属性对应的 effect 集合并交给调度器；相等性判断可避免无变化通知。数组的 push、splice 会同时影响索引、length 和迭代器相关依赖，因此一次操作可能触发多组 effect，但 scheduler 会去重。对对象整体替换时，旧代理上的依赖不会自动迁移，调用方必须改为追踪外层 ref。', '写入形成待调度任务'],
      ['effect 与渲染关系', '组件渲染函数本身是一个被追踪的 effect，模板里读取了哪些响应式值，渲染上下文就订阅哪些依赖。watch 的 getter 也是 effect 来源，但它的回调执行由 flush 配置决定。不要把异步请求后的新数据当作自动追踪对象：若变量只是模块级普通变量，写入不会通知任何视图；验证时可同时打印 effect 重跑次数和 DOM 文本。', '渲染与 watch 都是消费者'],
      ['清理过期依赖', '带条件读取的 effect 需要 cleanup，反复读取不同分支时清除不再使用的依赖。Vue 的 ReactiveEffect 在清理阶段移除旧 dep，再重新收集本轮依赖，避免对象被长期占用或无关更新触发回调。自定义 effect 若手动维护 dep，必须同时处理 add/remove；用切换分支的测试观察旧属性写入是否仍触发，可验证清理是否正确。', '分支切换要移除旧订阅'],
      ['无变化与删除边界', '响应式的相等性判断只处理常见值变化，对象内容相同但身份不同仍会触发；delete 也会走特定 trigger。若希望深层变化被追踪，reactive 的嵌套读取需要真正发生。验收时分别测试同值赋值、删除属性、嵌套字段和数组长度变化，并为每个结果记录 DOM 或 watch 次数，才能判断是依赖未建立还是业务逻辑提前返回。', '同值删除嵌套分别验证'],
    ],
  },
  {
    name: vueName(v1Stage, 'computed 缓存与纯派生状态'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会使用 ref 和模板插值，知道函数调用与派生数据的区别。',
    goal: '用 computed 表达可缓存的纯派生状态，理解惰性求值、脏标记和依赖失效，并能识别不该放进 computed 的副作用。',
    guidedPractice: '实现一个过滤列表的 computed，在 getter 中加入计数日志，连续读取多次后修改无关状态，观察缓存是否复用；再写一个会修改源数组的 computed，记录警告或重复渲染问题。',
    independentPractice: '把页面中的手写过滤函数改为 computed，并为空数组、大小写、分页切片和原数组不变性编写行为测试，证明结果由输入唯一决定。',
    commonErrors: [
      '在 computed getter 中发请求或修改源状态，把派生计算变成副作用。',
      '每次渲染都调用普通函数并误以为它具备 computed 的缓存。',
    ],
    sourceRefs: [
      'Vue 3 API: computed. https://vuejs.org/api/reactivity-core.html#computed',
      'Vue 3 Documentation: Computed Properties. https://vuejs.org/guide/essentials/computed.html',
    ],
    steps: [
      ['惰性求值与缓存', 'computed 接收 getter 并返回只读 ref，第一次读取才执行 getter，之后只要依赖未失效就返回缓存值。模板多次读取同一个 computed 不会重复计算，普通方法函数则每次渲染都可重新执行。用日志计数验证：连续访问两次应是同一结果，修改依赖后再访问才应增加一次。把依赖写在分支外或缓存对象外部，可能导致缓存判断失真。', '首次读取才计算'],
      ['脏标记与依赖图', 'computed 内部也维护 ReactiveEffect，依赖变化时把自身标记为 dirty，但不会立刻重新计算；下一次读取才重新执行 getter 并更新缓存。若依赖包含另一个 computed，链式失效会沿依赖图传播。这样可减少高频状态变化下的计算量，但如果 getter 自身执行很重，仍要评估是否需要 worker 或服务端预处理。', '变化先标脏后重算'],
      ['纯派生与不可变输入', '正确的 computed 只依赖响应式输入并返回新值，例如按关键字过滤数组、拼接标签、从列表汇总金额，不应直接 push 原数组。返回值若是新数组，模板遍历会看到新身份；若返回对象，注意每次失效都会创建新对象，可能触发依赖身份的下游 watch。将输入复制或使用只读视图，验证原数据在计算前后保持 deepEqual。', '派生不要改源数据'],
      ['可写 computed 的边界', '需要双向转换时才使用 get/set，例如把摄氏温度映射为华氏温度；set 必须明确更新哪个源，不能形成递归写入。大多数业务表单更适合在事件处理里显式更新，而不是给每个派生值开 setter。给 setter 加异常和边界测试，并检查 get 返回的格式、单位和小数处理，避免模板显示与保存值不一致。', '写回必须指向单一源'],
      ['性能与正确性验收', '用基准测试比较 computed 与普通过滤函数在大列表上的执行次数和耗时，但不要以微基准替代真实页面指标。验证依赖无关字段变化不重算、源字段变化会重算、结果不修改输入，并测试空列表和异常输入。若计算导致主线程长任务，考虑虚拟列表或分页；computed 只解决缓存，不解决算法复杂度或网络请求成本。', '缓存不等于算法优化'],
    ],
  },
  {
    name: vueName(v1Stage, 'watch、watchEffect 与清理'),
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '理解 ref 的读写，并能写简单的异步 Promise 与 AbortController。',
    goal: '按数据源和副作用选择 watch 或 watchEffect，掌握 immediate、deep、flush 与 onCleanup 的行为。',
    guidedPractice: '用 watch 监听查询词并延迟请求，用 watchEffect 监听表单字段自动保存；在回调里注册 onCleanup 取消计时器与 AbortController，连续输入时观察旧请求是否被取消。',
    independentPractice: '为筛选器实现防抖保存和错误提示，覆盖首次渲染不请求、空输入清空结果、快速切换只保留最新结果三种场景。',
    commonErrors: [
      '在 watch 回调里发请求却不取消旧请求，旧响应覆盖新结果。',
      '在 watch 内部修改正在监听的源，造成无限更新或重复请求。',
    ],
    sourceRefs: [
      'Vue 3 API: watch. https://vuejs.org/api/reactivity-core.html#watch',
      'Vue 3 API: watchEffect. https://vuejs.org/api/reactivity-core.html#watcheffect',
    ],
    steps: [
      ['源决定触发方式', 'watch 的第一个参数可以是 ref、getter、reactive 对象或数组，getter 能精确返回关注的子字段；watchEffect 自动收集回调执行中读取的依赖，适合简单同步副作用。监听 reactive 对象默认深层观察，引用自身的对象替换不一定触发。需要精确边界时优先 getter，而不是 deep 打开后靠 if 过滤所有变化。', '先定义精确的依赖源'],
      ['watchEffect 自动收集', 'watchEffect 首次立即执行，读取哪个响应式值就订阅哪个，未读取的字段不触发；副作用依赖条件分支时，重新执行后会清理旧依赖。自动收集很便利，但异步函数中的响应式读取发生在 await 之后，可能不在当前依赖收集窗口，不能想当然认为已追踪。把异步函数拆成同步回调加清晰参数，能避免隐式边界。', '自动收集有作用窗口'],
      ['flush 与 DOM 时机', 'flush=pre 让回调在组件更新前执行，适合根据状态准备数据；post 在 DOM 更新后执行，适合测量或聚焦；sync 会同步触发，容易在多次写入时重复执行。默认调度会合并同一轮更新。用 nextTick 验证顺序：先改状态、再读 watch 日志、然后等 DOM 更新断言。顺序不符时应改 flush，而不是堆 setTimeout。', '用 flush 控制时序'],
      ['清理函数与取消', 'watch 回调的第三个参数 onCleanup 在副作用重跑或停止时调用，适合 clearTimeout、abort 请求和移除监听。AbortController 的 signal 要传给 fetch，catch 需要区分 AbortError 与真实网络错误。连续输入测试中，旧请求应被取消或标记过期；如果只用序号忽略响应，也要保证旧请求的资源最终释放。', '新副作用开始前先清理旧副作用'],
      ['停止与组件生命周期', '在组件 setup 内创建的 watch 会随实例卸载自动停止，但在模块级、事件回调或异步任务中启动的 watch 需要手动 stop。用组件 unmount 测试确认 timers、订阅和请求都已停止；再检查回调是否捕获了已卸载组件的 DOM。关闭响应式监听不是性能装饰，而是防止内存泄漏和过期更新。', '作用域离开后不再执行'],
    ],
  },
  {
    name: vueName(v1Stage, '状态批处理与 nextTick'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解 Vue 更新是异步调度的，并能使用 Promise 或 async/await。',
    goal: '解释同一轮多次状态写入如何合并、组件更新何时进入队列，以及 nextTick 在 DOM 测量和焦点管理中的用法。',
    guidedPractice: '在一个事件处理函数中连续修改 count 和 title，分别在同步、await nextTick 后读取 DOM 文本；再用两次 nextTick 观察队列清空与事件循环顺序。',
    independentPractice: '实现点击展开面板后自动聚焦输入框，要求用 nextTick 等待 v-if 渲染，之后检查焦点元素、滚动位置与重复点击行为。',
    commonErrors: [
      '修改状态后立即读取 DOM，读到的是上一次渲染结果。',
      '把 nextTick 当成固定延迟，用它掩盖真正的异步请求或错误时序。',
    ],
    sourceRefs: [
      'Vue 3 API: nextTick. https://vuejs.org/api/general.html#nexttick',
      'Vue 3 源码: packages/runtime-core/src/scheduler.ts. https://github.com/vuejs/core/blob/main/packages/runtime-core/src/scheduler.ts',
    ],
    steps: [
      ['更新先入队', '模板渲染依赖变化时，Vue 不会每次赋值都同步重建 DOM，而是把组件更新任务放入 scheduler 队列，按 job id 排序并去重。同一轮内多次修改同一个 ref，读取时已是新值，但 DOM 仍可能保持旧文本。需要验证异步性时，可在同一个 tick 中先改状态并读取 element.textContent，再用 await nextTick 读取第二次结果。', '状态先变 DOM 后变'],
      ['批量写入减少工作', '一次事件处理里连续更新标题、列表和 loading，调度器只会为同一组件安排一次主要更新，多个组件则按父级优先的顺序 flush。批量更新不是任意跨 tick 合并，await 或 setTimeout 会切开任务。若用量是同步值而非 DOM，可在处理函数末尾用 watch 或 computed 读取最终值；不要为了批处理把错误吞掉或延后到看不见的微任务。', '同一轮任务合并更新'],
      ['nextTick 等到刷新后', 'nextTick 返回 Promise，在挂载更新和 pre 等任务处理后再让出，因此适合读取刚渲染的 DOM、设置焦点或测量尺寸。v-if 首次为真时新节点还未存在，直接 querySelector 返回 null；await nextTick 后再查才有结果。它不等待 fetch、图片解码或路由异步守卫，遇到这些仍要让对应 Promise 完成。', '等的是调度不是网络'],
      ['焦点与测量的边界', '打开抽屉后需要等待元素挂载，再调用 focus；关闭时应在销毁前保存触发按钮引用并恢复焦点。尺寸测量要等布局完成，可用 requestAnimationFrame 在 nextTick 之后再读 offsetWidth。测试时应断言 document.activeElement、aria-expanded 和滚动容器位置，而不是只看 class；无头浏览器与 jsdom 的布局能力有限，必要时用 Playwright。', '渲染后先测量再操作'],
      ['调度故障诊断', '若日志顺序或 DOM 结果异常，记录写入时间、nextTick 前后、watch flush 和组件更新顺序；不要只把 await 到处乱加。用 Performance 面板确认微任务是否形成长批次，用 Vue DevTools 查看哪些组件重复更新。验收至少覆盖同步读取、渲染后读取和异步请求后读取三种场景，证明每次等待的究竟是哪一类任务。', '先识别等待对象'],
    ],
  },
  {
    name: vueName(v1Stage, '响应式缺陷与竞态实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '会使用 AbortController 与 Promise，能通过浏览器 Network 面板观察请求。',
    goal: '复现依赖丢失、重复副作用和异步竞态，使用清理、取消和版本边界设计可解释的修复方案。',
    guidedPractice: '制造快速切换查询词场景，让慢请求 A 晚于快请求 B 返回；分别在无保护、序号判断和 AbortController 三种实现下记录最终列表与网络请求状态。',
    independentPractice: '为搜索页写竞态回归测试，覆盖失败重试、组件卸载、空输入和重复提交，并交付一份包含现象、根因、修复与观测证据的事故记录。',
    commonErrors: [
      '用清空列表掩盖竞态，用户仍可能看到旧请求覆盖的新结果。',
      '在组件卸载后更新状态，产生警告或对已销毁资源执行副作用。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Watchers. https://vuejs.org/guide/essentials/watchers.html',
      'MDN: AbortController. https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
    ],
    steps: [
      ['复现过期响应', '竞态的最小结构是输入 A 触发请求 A，输入 B 触发请求 B，B 先返回后 A 才返回；若响应处理只写结果，不留请求身份，A 会覆盖 B。用延迟 mock 或代理工具固定返回顺序，记录每次请求参数、开始时间和完成时间。实验必须重复出现，不能只在偶发网络下观察；稳定复现后才谈修复。', '先固定请求完成顺序'],
      ['序号守卫与取消', '请求开始时递增 requestId，响应回来时只有等于当前 id 才写入状态；这能阻止旧结果覆盖，但不一定释放网络资源。AbortController 在发起新请求或卸载时 abort，fetch 会以 AbortError 拒绝，旧响应不再处理。验证时同时看最终 UI、Network 中的 canceled 状态和 catch 分支，确保取消错误不会被当作业务失败提示。', '守卫结果并取消资源'],
      ['依赖丢失与重复订阅', '解构 reactive、在异步回调中读取状态、或在事件监听中重复创建 watch，都可能让依赖关系与预期错位。修复时把依赖改为 getter/ref，把监听注册放在稳定作用域，并在 cleanup 中移除监听器。用更新次数和监听器数量作为观测指标，连续挂载卸载组件后确认数量不增长；不要靠关闭 StrictMode 或清空缓存掩盖。', '依赖和监听都要可清理'],
      ['卸载与外部资源', '组件卸载时，定时器、WebSocket、ResizeObserver 和请求都应停止。setup 的 onScopeDispose 或 onUnmounted 可执行清理，watch 的回调在清理后不应触摸 DOM。用一个会在卸载后 resolve 的 Promise 测试，确认没有状态写入与警告；如果业务组件需要跨页面保留状态，应把所有权移到 store 并明确取消策略。', '谁创建资源谁负责释放'],
      ['端到端回归与复盘', '为搜索、分页和筛选添加 Playwright 用例：快速输入、切换路由、断网重试、返回上一页，断言最终标题、列表项和 URL 参数一致。复盘记录假设、复现步骤、根因、修复和未覆盖风险；只出现一次的问题也要保留日志与录屏。完成后再次查看 Network 与 Vue DevTools，确认没有隐藏旧请求或重复订阅。', '浏览器层证据收口'],
    ],
  },
];

// ── V2 组件、插槽、事件与表单 ────────────────────────────────────────────────
const v2Stage = '组件、插槽、事件与表单';

const VUE3_V2_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: vueName(v2Stage, 'props、emit 与组件输入输出'),
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '会创建 Vue 组件，并理解 ref 与模板绑定的基本用法。',
    goal: '用已声明 props 和 emit 建立单向数据流，掌握默认值、类型校验和事件命名，并能区分组件契约与内部实现。',
    guidedPractice: '实现一个金额输入组件，用 defineProps 接收 modelValue、min、label，用 defineEmits 声明 update 与 confirm 事件；在父组件中传入值和监听事件，故意传入错误类型观察开发警告。',
    independentPractice: '把页面中的原生 input 抽成 SearchField 组件，要求父组件拥有查询词状态，子组件只负责输入、清空和提交事件，并用组件测试验证每次 emit 的参数。',
    commonErrors: [
      '直接修改 props 对象或数组中的字段，破坏单向数据流。',
      '在父模板中监听 camelCase 事件名，或 emit 的值结构与声明不一致。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Props. https://vuejs.org/guide/components/props.html',
      'Vue 3 Documentation: Component Events. https://vuejs.org/guide/components/events.html',
    ],
    steps: [
      ['props 是只读输入', 'defineProps 声明父组件可传入的字段、类型和可选性，模板可直接读取，脚本中则得到响应式只读对象。props 变化会重新渲染子组件，但子组件不能直接写回；表单控件能改变 DOM value，不代表可以改 prop。需要用户编辑时，创建本地 ref 或把修改通过 emit 交回父级。用 Vue DevTools 查看 props 新旧值，并检查代码中是否有直接赋值。', '输入只读改由事件返回'],
      ['默认值与类型约束', 'withDefaults 可为对象型 prop 提供工厂默认值，避免多个实例共享同一数组或对象；类型检查只在开发期提供警告，不能替代服务端或运行时校验。必填字段缺失时应在组件测试中覆盖，不要把 undefined 渲染成字符串。若 prop 的合法值是有限枚举，模板和脚本共同维护一份常量，拒绝悄悄接收未知状态。', '默认值要有独立实例'],
      ['emit 是输出协议', 'defineEmits 接收事件名和参数类型，调用 emit(update, nextValue) 是向父级报告事实，不应在子组件里假设父级一定更新。事件名在模板中使用 kebab-case，脚本声明可用 camelCase，两者由编译器对应。为每个事件写清参数结构和触发时机，尤其区分 input、change 与 submit，避免父级收到半成品状态。', '事件报告事实不命令父级'],
      ['双向绑定只是约定', '父级可以用 v-model 同时传 modelValue 和监听 update:modelValue，但这仍是显式输入输出，不等于允许子组件修改 prop。子组件应在输入事件中 emit 新值，父级决定接受或拒绝。若父级异步校验失败，子组件可能短暂显示本地草稿，需要明确回滚与焦点策略；用输入、确认、拒绝三次操作验证最终状态。', 'v-model 也是显式事件'],
      ['契约测试与演进', '组件测试应 mount 子组件，断言 props 渲染、点击后 emit 名称和参数；再 mount 父组件，验证收到事件后状态与 DOM 更新。新增 prop 时给默认值并保留旧用例，删除或重命名事件时记录迁移。视觉检查不能替代事件断言，因为按钮看起来能点不代表 emit 了正确对象。', '输入输出分别有测试'],
    ],
  },
  {
    name: vueName(v2Stage, '插槽、作用域插槽与组合'),
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '会向组件传入普通 props，并能使用解构与数组渲染列表。',
    goal: '用默认插槽、具名插槽和作用域插槽设计组合点，理解插槽内容在父作用域编译，以及回退内容和插槽传递的边界。',
    guidedPractice: '实现一个 Panel 组件，提供 header、default、footer 三个具名插槽和 loading 回退内容；再实现一个列表组件，通过作用域插槽向父级暴露 item 与 index，渲染不同行样式。',
    independentPractice: '把两个重复卡片拆成通用 Card，只保留数据无关的布局与作用域数据，将标题、操作区和空状态交给调用方，并为默认回退写组件测试。',
    commonErrors: [
      '在子组件中试图直接访问父级插槽里声明的局部变量，导致作用域理解错误。',
      '组件同时用复杂 props 控制布局又开放多个插槽，形成难以组合的双重接口。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Slots. https://vuejs.org/guide/components/slots.html',
      'Vue 3 API: useSlots. https://vuejs.org/api/composition-api-setup.html#useslots',
    ],
    steps: [
      ['插槽是组合接口', '默认插槽由父级写标签之间的内容，子组件用 slot 激活；具名插槽让父级分别填充头部、正文和操作区。插槽内容在父组件作用域中编译，能访问父状态，但子组件只能通过作用域插槽把自身数据回传。把业务状态与布局都塞进 props 会让调用方难以定制，遇到需要任意内容时应优先考虑明确的 slot 名称。', '内容在父作用域编译'],
      ['作用域插槽回传数据', '子组件写 slot :item=item :index=index，父级用 v-slot={ item, index } 获取，再决定如何渲染。绑定对象应在子组件中保持稳定语义，不要临场塞入无关内部字段。对大量列表要避免每次渲染创建新对象导致下游更新，必要时把派生值放进 computed。用类型检查或运行时检查限制暴露字段，测试父级能正确拿到 key 和数据。', '子组件提供数据父组件渲染'],
      ['回退内容与空状态', 'slot 标签内可以写默认内容，当父级没有提供该插槽时显示；空状态通常要根据列表是否为空决定，而不是仅靠插槽是否存在。子组件应把 loading、empty、error 的优先级定义清楚，避免三个状态同时出现。用三个 mount 场景验证默认插槽、显式空插槽和错误插槽，确保没有重复文案或不可点击的骨架。', '状态优先级先定义'],
      ['插槽传递与封装边界', '中间组件可以把父级插槽继续传给内部组件，但要给每个插槽明确名称和可用数据，避免透传所有属性。过多 portal 式插槽会削弱组件内聚性；如果只是改变文本，用 props 更简单。为组合组件定义最小 contract：哪些插槽必须存在、收到哪些字段、能否包裹交互控件，并通过使用示例和测试冻结这些约束。', '组合点越少越稳定'],
      ['无障碍与布局验收', '插槽内容可能包含标题、按钮和列表，组件必须保证 DOM 结构允许正确语义，例如 heading 层级不因封装而跳变，面板的 aria-labelledby 指向真实标题。用 Playwright 检查焦点顺序和可访问名称，不能只截图看间距。移动端长内容要确认操作区不遮挡正文；若插槽内容溢出，容器应有明确 overflow 和键盘滚动策略。', '组合后仍要保持语义'],
    ],
  },
  {
    name: vueName(v2Stage, 'provide/inject 与依赖边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '理解组件树、setup 执行时机，并能使用 Symbol 作为对象键。',
    goal: '用 provide/inject 传递稳定上下文依赖，掌握注入默认值、只读暴露与作用域隔离，避免把全局 store 伪装成隐式魔法。',
    guidedPractice: '创建 ThemeProvider 用 Symbol key provide 一个主题对象和切换函数，在深层按钮组件 inject；故意在没有 provider 的组件中调用并观察默认值或错误。',
    independentPractice: '为一个表单布局提供 fieldId 前缀与错误查找函数，确保同页两个表单互不污染，并为缺少 provider、并发提交和组件卸载写测试。',
    commonErrors: [
      'provide 了可变对象本身，消费者绕过公开 action 任意修改内部状态。',
      '用字符串 key 在多个库或表单之间共享注入，发生难以定位的覆盖。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: provide / inject. https://vuejs.org/guide/components/provide-inject.html',
      'Vue 3 API: provide. https://vuejs.org/api/composition-api-dependency-injection.html#provide',
    ],
    steps: [
      ['依赖沿组件树流动', '祖先组件在 setup 同步阶段调用 provide，后代组件调用 inject 读取依赖，中间组件不需要显式转发 props。注入关系由组件实例树建立，跨异步边界的组件实例仍可沿父链查找；如果调用发生在错误的 setup 或应用上下文，可能拿不到值。用 Symbol 建 key，能避免不同模块的同名字符串冲突。', '沿实例树而非模块作用域'],
      ['暴露只读上下文', 'provide 的对象可包含状态、计算属性和受控 action，消费者只应通过公开方法修改。可以直接 provide readonly(state) 或一个只读 getter，避免深层组件随意写内部字段。需要双向交互时定义意图明确的函数，如 setFieldError，不要暴露整个内部 store。测试中尝试修改注入值应失败，合法 action 应留下可追踪事件。', '依赖入口要受控'],
      ['默认值与缺失策略', 'inject 的第二个参数可提供默认值，但默认对象也可能被多个消费者共享；函数型默认值应显式调用。对于必须由 provider 提供的依赖，缺失时抛出带组件名的错误比静默使用空对象更容易诊断。可把 provider 做成成对组合函数，内部负责注入 key、校验和错误信息，让业务组件不必重复判断。', '必需依赖要快速失败'],
      ['作用域隔离与嵌套 provider', '嵌套表单或弹窗可能各自创建 provider，最近祖先的依赖优先；不要把状态放在模块级变量后再 provide，否则多个实例仍会共享。组件卸载时 provider 的值应随实例释放，long-lived event 不应持有旧实例。用两个并排 provider 修改其中一个，另一个必须保持原状态，作为隔离验证。', '最近的 provider 决定作用域'],
      ['与全局 store 的取舍', 'provide/inject 适合布局、主题、表单上下文等沿树自然传播的依赖；Pinia 适合跨页面共享的业务状态。把请求缓存、用户会话或全局筛选全部塞进 inject 会隐藏数据来源，让调试和 SSR 请求隔离变难。画出依赖生命周期：谁创建、谁消费、何时销毁；若跨越整棵树且需要独立 devtools 历史，倾向 store。', '按生命周期选择依赖方式'],
    ],
  },
  {
    name: vueName(v2Stage, 'v-model 与受控表单状态'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会使用 ref 与事件，理解原生 input 的 value 和 change 事件。',
    goal: '实现原生与组件 v-model，区分输入草稿、已保存值和校验错误，能用 defineModel 或显式 props/emit 保持单向数据流。',
    guidedPractice: '给自定义文本输入组件添加 v-model，分别记录 input、blur、submit 时的值；在父组件故意拒绝一个格式错误，观察子组件显示值与已保存值是否分离。',
    independentPractice: '实现带姓名和邮箱的受控表单，要求父级拥有值、子组件只发更新事件，覆盖输入失焦、提交失败、服务器错误和重置四种状态。',
    commonErrors: [
      '同时维护 props 值和内部 ref，输入后不 emit，父组件与子组件显示不一致。',
      '用 v-model 绑定复杂对象后直接覆盖字段，丢失未编辑部分的响应性。',
    ],
    sourceRefs: [
      'Vue 3 Documentation: Form Input Bindings. https://vuejs.org/guide/essentials/forms.html',
      'Vue 3 Documentation: Component v-model. https://vuejs.org/guide/components/v-model.html',
    ],
    steps: [
      ['原生输入绑定', 'v-model 在 input 上组合 value 绑定和事件监听，文本默认用 input，checkbox 用 checked，select 用 change。值更新是 DOM 事件驱动的，不是双向共享内存；父状态变化也会重新写回控件。对输入法组合事件，Vue 会处理 composition 边界，但业务仍要决定何时去抖或校验。用打字、粘贴、清空和程序赋值四种操作验证，不能只测试一次键入。', '控件值与状态显式同步'],
      ['组件 modelValue 契约', '自定义组件默认接收 modelValue 并 emit update:modelValue，父级 v-model=form.name 会编译为绑定和监听。内部输入事件要 emit 新值，而不是直接改 prop；多参数绑定可用 defineModel 的命名模型或多个 model。组件声明 emit 的类型后，父级传错值应在类型检查或开发警告中出现，测试应断言 emit 的完整参数。', 'v-model 是 props 加事件'],
      ['草稿与已保存值', '大型表单常需要把输入草稿和服务器已保存值分开：输入先写 draft，提交成功后才更新 saved，取消或失败时恢复。若直接绑定同一个 reactive 对象，用户输入可能已经污染用于比较和重试的数据。用 shallowRef 或对象克隆保持快照，并明确哪些字段允许本地即时更新；测试失败提交后页面是否恢复与用户期望一致。', '编辑状态与提交状态分开'],
      ['校验与错误归属', '同步格式校验可在输入时提示，服务端唯一性或权限错误则要绑定到字段或表单级区域。错误对象应以字段名为键，模板通过 props 或注入取得，不使用全局变量。校验成功也不能保证提交成功，提交时需再次校验并禁用重复提交。用空值、超长、服务器 409 和网络超时分别验证错误位置与可读文本。', '前后端错误都落到明确位置'],
      ['可访问性与测试', 'label 的 for 必须匹配 input id，错误提示用 aria-describedby 关联，提交成功后通过 aria-live 宣布结果。测试优先按 role 和 label 定位，再 trigger input 或 change，断言 emit 与错误文本。不要用 querySelector(input) 抢占第一个元素，同页有多个表单时会互相误伤。键盘用户应能完成整个流程，焦点在失败后落到首个错误控件。', '表单状态必须可键盘操作'],
    ],
  },
  {
    name: vueName(v2Stage, '异步提交、错误和取消'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '会处理 Promise、try/catch 与 AbortController，并能写异步测试。',
    goal: '设计包含 idle、submitting、success、error 的表单状态机，保证重复提交、取消、超时和组件卸载都得到明确处理。',
    guidedPractice: '为保存表单加入请求函数，用 loading 禁用按钮、AbortController 取消旧请求、错误对象显示字段与全局错误；连续点击两次并模拟超时，记录请求次数和最终状态。',
    independentPractice: '实现带重试按钮的注册表单，要求成功后清空密码、失败保留输入、离开页面取消请求，并用 fake timers 覆盖超时与迟到的旧响应。',
    commonErrors: [
      '只用布尔 loading 表示所有阶段，成功后错误提示仍然可见。',
      '把网络错误和业务校验错误混成同一种提示，用户不知道是否需要修改字段。',
    ],
    sourceRefs: [
      'MDN: AbortController. https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
      'Vue 3 Documentation: Form Input Bindings. https://vuejs.org/guide/essentials/forms.html',
    ],
    steps: [
      ['先定义状态机', '表单至少有 idle、submitting、success、error 四个状态，错误再分字段校验、网络和权限。每次 transition 只允许从合法状态进入，例如 submitting 中不接受第二次提交，success 后按钮文案变化。用联合类型或常量表达状态，模板不要堆多个互斥布尔值。测试逐个状态断言按钮、提示和输入可编辑性，状态图比单个 loading 值更能暴露遗漏。', '状态互斥且有迁移规则'],
      ['提交前冻结输入', '提交开始时可禁用按钮但不应清空用户输入；需要防止重复点击时，在状态入口立即置 submitting，不能等 Promise resolve 后才更新。对需要幂等创建的接口，可生成 requestId 并在重试中复用。输入值在请求前做快照，响应回来时如果用户已经修改，询问是否覆盖或保留本地草稿。验证请求参数与当前显示值对应。', '提交入口先防重'],
      ['取消与超时边界', 'AbortController 要覆盖用户取消、路由离开和新的提交，signal 必须传入 fetch；超时可用 setTimeout 触发 abort，并在 finally 清理计时器。取消不应该显示为“服务器失败”，可显示已取消或保持可重试状态。用网络面板确认旧请求 canceled，测试中注入 AbortError，确保代码分支不会把已卸载组件再次更新。', '取消错误单独处理'],
      ['错误分层映射', 'HTTP 400 的结构化字段错误可直接映射到表单，401 进入登录，403 显示权限不足，409 提示冲突，5xx 和网络错误进入全局可重试区域。统一 API 客户端返回类型化错误，组件只负责展示与恢复。不要把后端堆栈或 token 放进用户文案。为每种错误保存 requestId，便于向服务端追踪。', '错误类型决定恢复动作'],
      ['组件卸载收口', '页面切换时，onBeforeUnmount 或作用域清理要 abort 进行中的请求并移除计时器。即使服务器已经处理成功，客户端也不能对已卸载 DOM 更新。用一个延迟 Promise 让组件先卸载再 resolve，断言没有警告、没有写入 destroyed ref、没有触发第二次 emit。刷新恢复可结合草稿版本号，但敏感字段不得无条件下持久化。', '卸载后不再触碰实例'],
    ],
  },
  {
    name: vueName(v2Stage, '组件契约测试与可访问性'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '已能使用 Vue Test Utils 写基础组件测试，并了解标签、焦点和 ARIA 的基础用法。',
    goal: '把组件的输入输出、键盘路径、ARIA 状态和视觉不变量转成自动化测试，避免只验证快照或内部实现。',
    guidedPractice: '为带展开按钮的筛选面板编写测试：按角色定位按钮，断言 aria-expanded、Tab 顺序、Escape 收起和焦点返回；再故意删除按钮名称，观察测试如何失败。',
    independentPractice: '为一个业务卡片建立契约用例，覆盖 props 渲染、emit、插槽回退、键盘操作、错误状态和窄屏无溢出，并给出仍需要人工验收的项目。',
    commonErrors: [
      '只做组件快照，模板改动导致大量差异但真实交互没有被验证。',
      '给按钮加 aria-label 后隐藏可见文字，导致视觉用户和辅助技术名称不一致。',
    ],
    sourceRefs: [
      'Vue Test Utils: Testing Accessibility. https://test-utils.vuejs.org/guide/advanced/a11y.html',
      'WAI ARIA Authoring Practices. https://www.w3.org/WAI/ARIA/apg/',
      'Playwright Accessibility Testing. https://playwright.dev/docs/accessibility-testing',
    ],
    steps: [
      ['契约清单先于断言', '把组件对外能力写成四栏：输入 props、输出 emit、插槽、用户可执行动作。每个动作至少有一个可观察结果，例如文本变化、焦点移动、网络请求或 emit 参数。测试文件按行为分 describe，而不是逐个内部函数。产品改变视觉可允许快照变化，但角色、名称、键盘路径和事件参数变更必须显式评审。', '接口与行为先列清单'],
      ['语义角色查询', '优先用 getByRole、getByLabelText 和可见文本定位，避免依赖 data-testid 掩盖不可访问控件。按钮必须是 button，复选框必须拥有可访问名称和 checked 状态；展开区域用 aria-controls 关联，关闭时按实际显示策略更新 aria-expanded。若测试只能通过点击 div 成功，说明真实用户用键盘无法完成同一动作。', '查询方式体现语义'],
      ['键盘与焦点回收', '为弹层和菜单记录触发元素，打开后把焦点送入内容，Tab 在边界内循环，Escape 收起并把焦点还给触发按钮。纯组件测试可断言 activeElement 与 emit，复杂布局和滚动交给 Playwright。不要用 tabindex 正数重新排序全局页面；验收时按 Tab 顺序走完整流程，并检查浏览器默认焦点轮廓未被隐藏。', '焦点移动要可逆'],
      ['状态与异步可读性', 'loading、空、错误和成功都要有可读文本，aria-busy 或 aria-live 只描述真实变化，不要每个渲染周期都播报。异步测试等待元素或 flushPromises，不用固定 sleep。错误提示应关联到控件，颜色对比度和文字大小通过人工或 axe 规则验证，但自动工具不能证明业务流程正确。', '异步状态也要被读出来'],
      ['窄屏与视觉不变量', '在 320、390 和 1440 宽度下检查按钮不被文字挤出、长词不遮住相邻控件、焦点环不会被 overflow 裁掉。为关键区域设置最小尺寸和断点，不在 CSS 中缩放到无法辨认。Playwright 截图用于回归，但断言应包含可访问名称和元素边界；把发现的视觉缺陷写成可执行用例再修复。', '截图之外还要检查边界'],
    ],
  },
];

// ── V3 Router、Pinia 与服务器状态 ───────────────────────────────────────────
const v3Stage = 'Router、Pinia 与服务器状态';

const VUE3_V3_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: vueName(v3Stage, '路由参数、查询参数和深链接'),
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '会安装并配置 Vue Router，理解 URL 路径和查询字符串的基本结构。',
    goal: '把页面状态映射到 URL，正确读取路径参数与查询参数，支持刷新、前进后退和可分享的深链接。',
    guidedPractice: '配置 /orders/:orderId?tab=items 路由，在页面中读取 useRoute 参数，用 router.push 修改 tab 与分页；复制 URL 到新标签页并刷新，检查筛选状态是否恢复。',
    independentPractice: '实现订单列表的页码与状态筛选同步，要求非法页码回退到 1、URL 编码正确、切换筛选时保留必要上下文，并为浏览器后退写一条自动化测试。',
    commonErrors: [
      '把筛选状态只放组件 ref，刷新或分享链接后全部丢失。',
      '直接拼接 query 字符串而不使用 router.push，导致编码、历史记录和参数丢失。',
    ],
    sourceRefs: [
      'Vue Router Guide: Dynamic Route Matching. https://router.vuejs.org/guide/essentials/dynamic-matching.html',
      'Vue Router API: useRoute. https://router.vuejs.org/api/#useRoute',
    ],
    steps: [
      ['路径参数表达身份', '动态段 :orderId 进入 route.params，适合表达资源身份；查询参数进入 route.query，适合筛选、排序和可选视图。params 的值经过 URL 编码，读取后仍是字符串，需要显式转数字和校验范围。资源不存在时应在数据请求后显示 not-found，而不是把未知 id 当成默认订单。把 URL、请求参数和页面标题一起记录，才能定位刷新后的状态偏差。', '身份放路径筛选放查询'],
      ['URL 是页面状态源', '筛选条件从 route.query 派生，用户操作调用 router.push 或 replace，组件再监听参数变化重新请求。不要复制一份本地 query ref 后与 URL 长期分叉；若需要输入草稿可短暂保留，提交时再同步 URL。使用 replace 避免每次击键都新增历史，用户真正切换页面时使用 push。后退测试应恢复上一组参数和滚动位置。', '操作先改 URL 再派生视图'],
      ['深链接校验与规范化', '收到 page=0、status=unknown 或带额外空键的 URL 时，先按白名单规范化，再替换历史状态或显示空结果。不要把 URL 值直接拼进 API 路径，使用 URLSearchParams 或路由对象序列化。资源 id 中可能含斜杠和中文，编码边界要在生成链接时处理。复制链接、刷新、粘贴到无登录浏览器三种动作都应得到相同解释。', '外部 URL 输入必须校验'],
      ['滚动与导航恢复', 'scrollBehavior 可根据 savedPosition 恢复后退位置，新导航通常滚到顶部或锚点；异步列表加载完成后若 DOM 高度未稳定，滚动可能落在错误位置。可在数据渲染后等待 nextTick，再执行锚点定位。记录导航来源与恢复结果，避免前进后退时每次都强制顶部。', '滚动恢复属于路由契约'],
      ['历史与生命周期', '同一个组件在参数变化时可能被复用，created 或 setup 不会重新执行，因此请求逻辑要监听 route 参数或使用路由守卫。离开页面时取消未完成请求，避免旧页面结果覆盖新页面。用浏览器前进后退、直接打开深链和同路由改 query 四种方式验证，检查请求次数和最终 URL。', '复用组件也要响应参数'],
    ],
  },
  {
    name: vueName(v3Stage, '导航守卫与权限边界'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会配置 Vue Router，知道登录状态和重定向查询参数的基本概念。',
    goal: '用全局与路由级守卫保护页面，处理异步登录恢复、重定向回跳和 401/403 区分，并明确前端权限不等于服务端授权。',
    guidedPractice: '为 /admin 添加 meta.requiresRole，在 beforeEach 中等待用户信息恢复；未登录跳转 login 并带 redirect，权限不足跳转 403，登录成功后回到原路径。',
    independentPractice: '实现三条受保护路由，覆盖刷新时 token 未恢复、角色变化、守卫重复重定向和接口返回 403 的分支，并记录每次导航最终落点。',
    commonErrors: [
      '只检查本地 localStorage 是否有 token，不验证 token 是否过期或用户角色。',
      '登录页也受同一个未登录守卫保护，造成无限重定向。',
    ],
    sourceRefs: [
      'Vue Router Guide: Navigation Guards. https://router.vuejs.org/guide/advanced/navigation-guards.html',
      'OWASP Authorization Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html',
    ],
    steps: [
      ['守卫的导航阶段', '全局 beforeEach 在路由确认前执行，返回 false 取消导航，返回路由位置发起新导航；异步守卫要等待用户信息恢复。解析、组件内守卫和 afterEach 发生在不同阶段，afterEach 不适合做权限拒绝。把权限判断集中在可测试函数中，路由守卫只负责调用并转换结果，避免每个页面复制角色字符串。', '权限判断与导航动作分开'],
      ['登录恢复与重定向', '刷新页面时内存用户为空但 cookie/token 可能有效，守卫应先调用一次去重的会话恢复 Promise，再决定允许或跳转。跳转登录时把原 fullPath 放进 redirect，并限制只接受站内路径，防止开放重定向。登录成功后用 router.replace 回到目标，使用 replace 避免返回键再次回到登录页。', '恢复会话后再判定'],
      ['未授权与禁止访问', '401 表示缺少或失效身份，应去登录；403 表示身份有效但没有权限，应显示 403 页面，不应陷入登录循环。服务端接口仍必须检查对象级权限，前端隐藏按钮只改善体验。用普通用户访问管理员 URL、过期用户刷新、管理员被撤权三种场景测试路由和 API 两层结果。', '认证失败与授权失败分开'],
      ['导航竞态与重复跳转', '快速点击多个链接时，前一次导航可能被后一次覆盖；异步守卫返回路由后要确认没有把用户带入循环。登录状态变化可触发刷新，先取消旧的恢复请求再重试一次。日志中记录 from、to、redirect 和决策原因，不要记录 token。发现无限循环时查看浏览器导航次数和守卫返回值。', '重定向链要能终止'],
      ['服务端授权证据', '前端权限只决定显示和导航，真实 API 必须通过 cookie、Authorization 或会话校验，并对每个资源检查所有权。页面请求 403 时不要自动清空本地用户后跳登录，而应提示无权限或刷新权限。验收时直接用工具请求相同 API，验证绕过按钮和后门 URL 仍被拒绝，形成前后端双重证据。', '前端守卫不能替代服务端'],
    ],
  },
  {
    name: vueName(v3Stage, 'Pinia 模块、actions 与持久化'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会使用 composition API，并能读写 localStorage 或 sessionStorage。',
    goal: '设计职责清晰的 Pinia store，通过 action 封装业务变更，合理持久化部分状态并处理版本迁移与敏感数据边界。',
    guidedPractice: '创建用户偏好 store，用 defineStore 的 setup 形式保存折叠状态和最近筛选，在 action 中统一更新并写 storage，再刷新页面检查恢复结果。',
    independentPractice: '为一个多标签工作台增加 persist 配置，只持久化标签 id 和顺序，不保存临时错误；模拟旧版本数据迁移、损坏 JSON 和权限变化三种情况。',
    commonErrors: [
      '把远程数据、表单草稿和瞬时 loading 全部持久化，刷新后得到过期结果。',
      '组件直接修改 store state，绕过 action 的校验、日志和持久化逻辑。',
    ],
    sourceRefs: [
      'Pinia Documentation: Defining a Store. https://pinia.vuejs.org/core-concepts/',
      'Pinia Documentation: Actions. https://pinia.vuejs.org/core-concepts/actions.html',
      'pinia-plugin-persistedstate. https://prazdevs.github.io/pinia-plugin-persistedstate/',
    ],
    steps: [
      ['store 边界先分类', 'Pinia 适合跨组件共享、需要调试历史和跨路由保留的客户端状态，例如用户偏好、工作台标签和认证摘要。服务器列表、请求 loading 和错误更适合查询缓存管理；组件独占的表单草稿留在组件内。把状态分类写进 store 注释，能阻止一个巨型 store 演化成所有数据的垃圾桶。', '客户端状态与服务器状态分开'],
      ['setup store 与 action', 'defineStore 的 setup 形式可以返回 ref、computed 和函数，action 内调用其他 store 或 API，并把成功、失败和清理写成完整流程。组件通过 storeToRefs 获取解构的 ref，避免直接解构 store 丢响应性。修改应经 action 校验，尤其权限和版本号；用 DevTools 的 action 时间线检查每次状态变化来源。', '变更必须留下可追踪入口'],
      ['持久化选择字段', 'pinia-plugin-persistedstate 可通过 paths 选择字段，并用 storage 指定 localStorage 或 sessionStorage；只保留恢复后仍有意义的配置，不持久化 token、密码、错误堆栈或可能含个人数据的列表。为持久化 key 加命名空间和版本，页面加载时校验 JSON，损坏时回退默认值并清除坏数据，防止一次手工修改让整站白屏。', '白名单持久化并校验版本'],
      ['迁移与兼容', '旧版本字段改名或结构变化时，使用 migrate 函数把旧对象转换为新结构，遇到无法识别的版本就恢复默认。迁移函数应是纯函数并覆盖缺失字段和超长数组。部署新代码后用户可能仍打开旧标签页，action 要能处理旧字段，不能假设所有客户端同步升级。用固定旧版 JSON 在测试中验证迁移结果。', '持久数据要有迁移路径'],
      ['跨标签页与退出', 'localStorage 变化不会自动同步 Pinia 内存状态，跨标签页需要监听 storage 事件或重新读取；退出登录时清理所有相关 key，避免下一个用户继承筛选甚至个人信息。持久化写入失败如 quota 超限时应降级内存状态并提示，而不是让主流程崩溃。用双标签页登录退出和存储禁用场景验证。', '存储生命周期跟随用户'],
    ],
  },
  {
    name: vueName(v3Stage, '远程数据缓存和失效'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '会使用 fetch 或 axios，并理解 HTTP 状态码、缓存键和异步状态。',
    goal: '用查询缓存表达服务器状态，设计稳定 queryKey、staleTime、垃圾回收和 mutation 失效，避免把远程数据复制进 Pinia。',
    guidedPractice: '用 TanStack Query 的 useQuery 加载订单列表，key 包含 page 和 status；在详情页 mutation 后 invalidateQueries，观察列表重新请求与缓存状态。',
    independentPractice: '为列表和详情建立共享缓存，实现新增、编辑、删除后的精确失效，覆盖同一资源多页面切换、窗口重新聚焦和网络离线场景。',
    commonErrors: [
      '在多个组件各自维护远程列表 ref，更新一个页面后其他页面仍显示旧数据。',
      'queryKey 遗漏筛选参数，导致不同查询复用同一缓存并被误判命中。',
    ],
    sourceRefs: [
      'TanStack Query Vue Guide. https://tanstack.com/query/latest/docs/framework/vue/overview',
      'TanStack Query: Query Keys. https://tanstack.com/query/latest/docs/framework/vue/guides/query-keys',
    ],
    steps: [
      ['服务器状态单独管理', '远程数据需要缓存、重试、失效、过期和并发协调，这些语义与 UI 开关不同。Pinia 可以保存用户偏好和已确认的客户端选择，查询库负责列表和详情。把接口响应复制到 store 会产生两份真相，谁负责刷新变得模糊。先按资源划分 query 域，再决定哪些派生 UI 状态留在页面。', '远程真相只保留一处'],
      ['queryKey 是缓存身份证', 'key 应包含资源名、对象 id、分页、排序和影响响应的筛选条件，并保持数组结构和值稳定。相同语义不同顺序的数组会产生不同缓存；缺失关键字会让用户切换筛选后看到上一条结果。把参数规范化函数抽出，在请求函数和 key 中复用，测试不同 key 的命中与 miss。', '缓存键必须覆盖请求输入'],
      ['staleTime 与更新策略', 'staleTime 表示数据在多久内可视为新鲜，gcTime 控制无订阅缓存何时清理；两者不是越长越好。频繁变化的库存列表需要较短缓存并在 mutation 后失效，稳定配置可较长。窗口聚焦、重连和手动刷新策略要与业务风险匹配，避免每个组件都后台无界刷新。用时间推进测试验证状态变化。', '新鲜度和回收分开配置'],
      ['mutation 精确失效', '新增订单后失效订单列表，修改详情后失效对应详情并更新列表；只模糊失效全部根 key 可能造成无关请求风暴。mutation 成功与失败的最后状态都要处理，失败时保留旧缓存并显示错误。对于确定的新值可使用 setQueryData 乐观更新，但必须准备回滚。用网络日志核对失效范围。', '失效范围跟数据依赖一致'],
      ['离线与缓存恢复', '断网时查询可能返回缓存数据并带错误状态，界面要告诉用户数据可能过期，提供重试。不要在没有网络时无限轮询；重连后按策略刷新。序列化缓存只用于可公开、时间敏感度低的资源，敏感数据不写入通用持久缓存。演练离线打开、恢复网络和重新聚焦三条路径。', '离线恢复要显式提示'],
    ],
  },
  {
    name: vueName(v3Stage, '请求竞态、重试与错误恢复'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解 Promise 失败、HTTP 状态码和查询缓存的 basic 状态。',
    goal: '为远程请求设计取消、截止时间、指数退避和错误恢复，区分可重试失败与不可重试业务错误。',
    guidedPractice: '给查询请求加入 AbortSignal、超时和最多两次指数退避重试，分别模拟 429、500、400 和断网，记录请求次数、最终 UI 和缓存状态。',
    independentPractice: '实现订单详情页的刷新、重试和返回列表流程，要求旧请求不能覆盖新资源，重试按钮只对可恢复错误出现，并输出一份错误矩阵。',
    commonErrors: [
      '所有错误自动重试，包括 400、401 和 404，放大无效请求并延迟用户反馈。',
      '重试函数创建新 AbortController，却没有清理旧计时器或监听器。',
    ],
    sourceRefs: [
      'TanStack Query: Query Retries. https://tanstack.com/query/latest/docs/framework/vue/guides/query-retries',
      'MDN: AbortController. https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
      'RFC 9110: HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110.html',
    ],
    steps: [
      ['错误分类矩阵', '先记录接口、状态码、响应结构、是否幂等和用户恢复动作。网络失败、502、503、429 通常可重试，400、401、403、404 需要登录、修改输入或停止；创建类 POST 若无幂等键，不能盲目重试。把分类写进 API 客户端而不是每个页面，页面只消费 errorKind 与可操作消息。', '先分类再决定重试'],
      ['指数退避与上限', '重试间隔可按 base * 2^attempt 加随机抖动，并读取 Retry-After，最大尝试次数和总截止时间同时限制，避免请求风暴。重试期间显示尝试次数和可取消按钮，页面离开立即 abort。用 fake timers 检查每次间隔和最终次数，不能只用真实 sleep 等待测试。', '次数与总时长双重上限'],
      ['取消覆盖新请求', '每个资源请求绑定自己的 AbortSignal，切换订单或筛选时取消旧请求；查询库通常以 key 管理取消，手动 fetch 则需保存 controller。响应处理要再次检查 signal 或 requestId，防止取消竞态。Network 面板应看到旧请求 canceled，DOM 只显示最新 id 的数据。', '新请求开始旧请求结束'],
      ['缓存失败与重试', '重试失败后保留可用的旧缓存，同时显示“数据可能过期”与最后成功时间；没有缓存时显示错误页和重试。不要用空数组伪装成功，分页总数、空状态与错误状态必须区分。查询库的 retry 配置按 query 设置，mutation 则根据幂等性单独配置。', '失败状态不能伪装成空数据'],
      ['恢复与幂等', '用户点击重试时复用同一资源 key，若服务端可能已经创建数据，需要 clientRequestId 或幂等键。成功恢复后清除错误、刷新时间和缓存，失败恢复不能丢掉输入。对已提交事务的二次确认要查询状态而不是直接重复写入。用一次 500 后成功、一次 409 的场景验证。', '恢复动作要考虑副作用'],
    ],
  },
  {
    name: vueName(v3Stage, '多页面企业功能实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已完成 Router、Pinia、查询缓存与组件表单的学习，能运行端到端测试。',
    goal: '把 URL、权限、客户端偏好与服务器查询串成多页面功能，验证刷新、深链、缓存和权限失败下的完整业务流程。',
    guidedPractice: '选择订单列表、详情和编辑三页，配置动态路由、Pinia 用户偏好、查询 key 和 403 页面；录制从深链打开到编辑保存的完整路径。',
    independentPractice: '交付一个含筛选、分页、详情、编辑和返回恢复的功能，要求三页共享缓存一致、刷新不丢 URL、权限失败可解释，并附 Playwright 测试与一次故障复盘。',
    commonErrors: [
      '每个页面各自保存筛选，返回列表时显示默认条件而非用户刚才的选择。',
      '详情保存成功后只更新详情，不失效列表缓存，导致返回仍看到旧值。',
    ],
    sourceRefs: [
      'Vue Router Guide: Data Fetching. https://router.vuejs.org/guide/advanced/data-fetching.html',
      'TanStack Query Vue Guide. https://tanstack.com/query/latest/docs/framework/vue/overview',
      'Pinia Documentation. https://pinia.vuejs.org/',
    ],
    steps: [
      ['按真相来源分工', 'URL 保存可分享的筛选、分页和资源 id；Pinia 保存用户偏好、标签或跨页面会话；查询缓存保存服务器响应；组件本地只保存短暂输入草稿。先画数据流再写页面，避免同一个页码同时存在 URL、store 和组件三份。切换页面时以 URL 和缓存 key 重建视图，偏好只补充展示方式。', '每种状态只有一个主来源'],
      ['路径与页面加载', '列表页监听路由 query 变化重新取数，详情页用路由参数构造 query key，编辑页先加载详情再填草稿。进入编辑前检查权限和版本号，离开有未保存内容时弹出确认。加载、空、403、404、错误和保存中分别有可操作界面，不能用一个通用 loading 覆盖所有状态。', '页面状态先分类再渲染'],
      ['跨页缓存一致性', '保存详情成功后，更新详情缓存并按依赖失效列表、筛选计数和首页摘要；删除资源后从相关缓存移除并导航回列表。mutation 失败时恢复旧缓存和草稿。记录失效 key 与请求日志，确保返回列表立即显示新值，不需要用户手工刷新。', '写操作同步影响所有读视图'],
      ['权限与错误恢复', '导航守卫先恢复会话，再检查页面角色；API 返回 403 时显示权限说明而不是登录页，返回 401 时清理会话并带回跳。用户被撤权后旧页面缓存可能仍在内存，切换路由或重新聚焦时应重新校验。用两个角色和过期会话测试每个入口。', '权限变化及时收口'],
      ['端到端验收', '用 Playwright 从深链进入、筛选、翻页、打开详情、编辑、保存、返回，断言 URL、列表内容、焦点和滚动位置。模拟慢网和 500，检查重试与草稿保留；刷新页面验证持久偏好不会覆盖 URL。测试失败保留 trace、截图和网络日志。', '按真实用户路径验收'],
    ],
  },
];

// ── V4 工程、测试、性能与可访问性 ────────────────────────────────────────────
const v4Stage = '工程、测试、性能与可访问性';

const VUE3_V4_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: vueName(v4Stage, '目录、别名、环境变量与 API 客户端'),
    track,
    contentStatus: 'reviewed',
    minutes: 38,
    prerequisite: '能启动 Vite 项目，并理解 ES Module 的相对路径导入。',
    goal: '建立可维护的目录、别名与环境变量边界，封装统一 API 客户端，避免页面直接拼 URL 和处理基础设施错误。',
    guidedPractice: '在 vite.config.ts 配置 @ 指向 src，在 tsconfig 中同步 paths，创建 src/api/client.ts 注入 baseURL、超时和错误转换；运行开发与构建验证别名同时可用。',
    independentPractice: '把三个页面中的 fetch 调用迁移到类型化 API 客户端，配置开发与预览环境变量，日志和 UI 都不泄露令牌，并为 401、500 与网络失败写统一测试。',
    commonErrors: [
      '只配置 Vite alias 却没有同步 tsconfig paths，编辑器与 vue-tsc 报找不到模块。',
      '把 API 密钥放在 VITE_ 前缀变量，误以为浏览器构建后仍然保密。',
    ],
    sourceRefs: [
      'Vite Guide: Resolve Alias. https://vite.dev/config/shared-options.html#resolve-alias',
      'Vite Guide: Env Variables and Modes. https://vite.dev/guide/env-and-mode.html',
      'MDN: Fetch API. https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
    ],
    steps: [
      ['目录按职责分层', '把入口、页面、领域组件、组合函数、API、状态和测试分开，但不要为每个小组件建一个名词空目录。页面只编排路由与组合，领域组件保存业务交互，API 层处理 URL、请求头和错误协议。依赖方向应从页面指向领域与基础设施，不能让底层组件反向 import 页面。用 import graph 或 lint 规则检查循环依赖。', '目录表达依赖方向'],
      ['alias 要双端一致', 'Vite 的 resolve.alias 让运行时构建能识别 @/pages，tsconfig 的 compilerOptions.paths 负责编辑器与 vue-tsc 的类型解析，Vitest 还需要继承同一配置。三者不一致时，开发可能能跑但构建或测试失败。别名只应用于稳定的 src 根，不把 node_modules 内部路径私有化；用 pnpm build、vue-tsc 和单测共同验证同一 import。', '构建、类型、测试共享别名'],
      ['VITE_ 都是公开值', 'Vite 会把 import.meta.env.VITE_* 在构建时嵌入客户端资源，任何能下载 JS 的人都能读取。API 基地址、公开开关和版本号可放其中，服务端密钥、数据库密码绝不能进入。运行时配置可通过服务端接口或 window 配置注入，但同样不构成秘密。用构建产物全文搜索 token 名称作为发布门禁。', '客户端环境变量等于公开'],
      ['API 客户端统一边界', 'createClient 或 request 函数集中处理 baseURL、查询序列化、超时、JSON 解析、AbortSignal 与错误映射，业务函数只声明资源路径和类型。错误对象保留 status、code、requestId、字段错误和可重试性，UI 不解析原始堆栈。响应类型仍要在运行时校验关键字段，TypeScript 只能证明声明，不能证明服务器真的返回该结构。', '基础设施细节进客户端'],
      ['鉴权与刷新', '令牌不应默认写 localStorage，优先使用符合架构的 HttpOnly cookie；每次请求携带 credentials 时明确 same-origin 或允许域名。遇到 401 只允许一个刷新请求，其余等待同一 Promise，刷新失败统一清理会话。避免在日志记录 Authorization 完整值。用过期 cookie、并发 401 和刷新失败三条用例检查。', '并发刷新要有单飞'],
    ],
  },
  {
    name: vueName(v4Stage, 'vue-tsc、ESLint 与提交门禁'),
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '会运行 TypeScript 编译，并能看懂 ESLint 与 Vue 单文件组件错误。',
    goal: '配置 vue-tsc、ESLint 与 CI 门禁，使模板类型、脚本类型和常见交互错误在合并前被发现。',
    guidedPractice: '运行 vue-tsc --noEmit 检查一个模板 props 传错类型的组件，再配置 ESLint 的 Vue flat config 和 TypeScript parser，让未使用变量与错误事件名触发失败。',
    independentPractice: '为仓库建立 lint、typecheck、test、build 顺序的 CI 脚本，分别制造一个类型错误和一个规则违规，确认流水线在对应阶段失败并输出可定位问题。',
    commonErrors: [
      '只运行 tsc，不运行 vue-tsc，模板中的类型错误被完全跳过。',
      '遇到 lint 错误就关闭规则或整行禁用，没有说明原因和替代约束。',
    ],
    sourceRefs: [
      'vue-tsc. https://github.com/vuejs/language-tools/tree/master/packages/tsc',
      'ESLint Documentation: Configuration. https://eslint.org/docs/latest/use/configure/',
      'Vue TypeScript Tooling. https://vuejs.org/guide/typescript/overview.html',
    ],
    steps: [
      ['模板也属于类型系统', 'vue-tsc 在 TypeScript 基础上理解 .vue 文件的 script、template 与宏，能检查 props 名称、事件参数、插槽字段和模板表达式。普通 tsc 不理解 SFC 模板，因此可能全部通过。把 vue-tsc --noEmit 放进本地和 CI 脚本，覆盖组件、测试环境与 tsconfig 引用；编译产物仍由 Vite build 单独验证。', 'SFC 模板必须用 vue-tsc'],
      ['ESLint flat config', '现代 ESLint 使用 eslint.config.js 组合插件与规则，Vue 插件负责解析 SFC，TypeScript parser 负责类型语法，Vitest 与 Playwright 目录应有各自环境。先启用 vue/recommended 和基础类型规则，再按团队风险逐步增加，不要一次堆满第三方预设。用 eslint --print-config 检查某个 .vue 文件实际应用了哪些规则。', '先看最终配置再调规则'],
      ['脚本与模板共同约束', '禁止未声明变量、未处理 Promise、错误事件名和可疑 v-html 等规则应覆盖模板；类型层面检查 prop 与 emit 泛型。对于第三方的全局变量，用类型声明或 eslint globals 显式登记，不用 any 消灭错误。把错误修在源码边界，若确实需要禁用，写明原因和未来移除条件，并让禁用范围最小。', '禁用规则要有到期理由'],
      ['门禁顺序与反馈', 'CI 先运行便宜的 lint 与 vue-tsc，再跑单测和构建；每一步使用独立命令，失败输出指向具体文件。缓存 node_modules 可以加速，但缓存键必须包含锁文件哈希。PR 页面应能看到失败阶段和日志，不能把所有检查塞进一个 shell 后只返回总退出码。', '失败阶段必须可辨认'],
      ['故意失败验证', '在临时分支把按钮事件参数改成错误类型、删除一个使用中的 import、并让一个模板引用不存在字段，分别运行 vue-tsc 与 ESLint，确认至少一项能拦截。记录命令、退出码和首条错误；若错误未被拦截，补规则或类型声明，而不是靠 code review 记忆。', '用已知错误测试门禁'],
    ],
  },
  {
    name: vueName(v4Stage, 'Vitest 单测与组件测试'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '能写 arrange、act、assert 风格的测试，并了解 mock 与 fake timers。',
    goal: '建立分层的 Vitest 测试，区分纯函数、组合函数和组件行为，避免脆弱实现断言并正确处理异步状态。',
    guidedPractice: '为金额格式化纯函数、筛选组合函数和搜索组件各写一组测试，使用 vi.mock 隔离 API、vi.useFakeTimers 验证防抖，并查看覆盖率报告中的未覆盖分支。',
    independentPractice: '为一个带远程加载的列表补正常、空、错误和重试测试，要求每个测试独立初始化 store、清理 mock，并在随机顺序执行时仍稳定。',
    commonErrors: [
      '在组件测试里模拟内部私有方法，而不是通过用户操作验证行为。',
      '测试之间共享同一个 Pinia 或 mock 状态，单独运行通过而全量运行失败。',
    ],
    sourceRefs: [
      'Vitest Guide. https://vitest.dev/guide/',
      'Vue Test Utils Guide. https://test-utils.vuejs.org/guide/',
      'Vitest Mocking. https://vitest.dev/guide/mocking.html',
    ],
    steps: [
      ['按风险分层测试', '纯格式化、权限判断和 queryKey 构造适合快速单测；组合函数可借助 effectScope 和测试环境验证响应式依赖；组件测试验证 props、emit、插槽与可见状态。真正跨浏览器和网络的行为交给 Playwright。测试层不是越多越好，而是每一层解决它最擅长的问题，重复覆盖同一断言会增加维护成本。', '不同层级验证不同风险'],
      ['环境与依赖隔离', 'Vitest 配置 jsdom 或 happy-dom 提供 DOM，但两者的布局能力有限；API、路由和 store 在每个用例中创建新实例，mock 后 afterEach restore/clear。组件挂载用 attachTo 明确 DOM 归属，结束 unmount，避免全局节点和事件泄漏。并行测试中使用唯一 storage 与随机 id，防止互相写坏数据。', '每个用例从干净作用域开始'],
      ['异步与计时器', 'await flushPromises、vi.waitFor 或 find 都可用于等待状态稳定，但 fake timers 会改变 setTimeout 和 Date，需要按用例开启并在 finally 恢复。验证防抖时先推进时间，再检查 mock 调用次数和参数；不要同时使用真实 sleep。请求取消要断言 signal aborted，而不是只检查 UI 不再 loading。', '等待语义明确且可清理'],
      ['组件行为断言', 'mount 后按可访问角色找到控件，trigger 输入或点击，断言 emit 参数和渲染结果。需要路由时创建 memory history，需要 Pinia 时用测试插件或显式 store。避免直接访问 wrapper.vm 的内部 ref，因为重构实现会让测试大面积失效，也不能证明用户真的看到了结果。', '操作与结果优先内部字段'],
      ['覆盖率与变异思考', '覆盖率报告用于找未执行分支，不直接代表质量；优先补权限拒绝、空数据、请求失败和竞态分支。对关键函数可人工制造条件错误，确认测试会失败。清理无效快照和重复断言，保留每个测试的失败信息与业务场景名称，让 CI 输出能直接指向风险。', '覆盖高风险分支而非刷数字'],
    ],
  },
  {
    name: vueName(v4Stage, 'Playwright、键盘与移动流程'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能运行端到端测试，理解浏览器选择器、可访问角色和视口设置。',
    goal: '用 Playwright 验证真实路由、网络与浏览器行为，覆盖键盘操作、移动视口、焦点恢复和失败追踪。',
    guidedPractice: '为一个登录到列表的流程写 Playwright 测试，使用 getByRole 和 label 定位，按 Tab、Enter、Escape 完成导航，设置移动视口并捕获 trace。',
    independentPractice: '为搜索筛选写桌面与移动两条端到端路径，模拟慢网络和 500，断言焦点、滚动、URL、错误提示和重试，要求测试可独立重复运行。',
    commonErrors: [
      '使用固定 sleep 等待页面，CI 负载稍高就随机失败。',
      '只用 CSS 类选择器定位控件，组件换样式后测试失效且无法证明可访问性。',
    ],
    sourceRefs: [
      'Playwright Test Documentation. https://playwright.dev/docs/test-intro',
      'Playwright Accessibility Testing. https://playwright.dev/docs/accessibility-testing',
      'WAI-ARIA Authoring Practices. https://www.w3.org/WAI/ARIA/apg/',
    ],
    steps: [
      ['真实浏览器边界', 'Playwright 启动实际浏览器，验证 Vue、Router、CSS、网络和浏览器历史共同作用。配置 webServer 启动应用或复用已有服务，测试开始前等待可用 URL，结束后保留 trace、video 和截图。端到端测试只覆盖关键用户旅程，不要用它替代所有组件测试。', 'E2E 验证系统组合行为'],
      ['语义选择器', '优先 getByRole、getByLabel 和 getByText，必要时用 getByTestId 标识纯视觉或无稳定语义区域。按钮应有可访问名称，表单控件应有 label；如果测试只能靠 nth-child 找到元素，真实用户也难以识别。选择器本身是可访问性证据，失败时应修界面语义。', '选择器就是用户视角'],
      ['键盘完整路径', '用 page.keyboard.press 完成 Tab 顺序、Enter 提交、Space 切换和 Escape 关闭，断言 document.activeElement 或 toBeFocused。打开菜单后焦点进入内容，关闭后回到触发按钮；不要用 mouse.click 模拟所有动作。Tab 循环和 aria-expanded 状态在复杂弹层中要单独测试。', '键盘路径必须完整'],
      ['移动视口与触摸', '设置 390x844 和 320 宽度，验证底部操作在安全区、浮动按钮不遮住内容、横向没有溢出。触摸目标至少 44 像素，长文本可换行且不被裁切。真实设备模拟无法完全代表软键盘和滚动惯性，因此还要记录人工设备验收项，手机旋转后重新检查布局。', '移动行为不只看截图'],
      ['网络与时序控制', '用 page.route 拦截 API，延迟返回、返回 500 或断网，验证 loading、错误、重试和重复提交。等待可见元素或响应，而不是固定 sleep；如果必须等待动画，用 reduceMotion 或断言最终状态。并发测试使用独立账号和命名空间，避免互相清理数据。', '网络条件要可重复'],
    ],
  },
  {
    name: vueName(v4Stage, '代码分割、缓存和 Web Vitals'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '会阅读构建产物和浏览器 Performance 面板，了解基本 HTTP 缓存头。',
    goal: '通过路由懒加载、异步组件、资源哈希与缓存策略改善首屏和交互性能，并用 Web Vitals 与预算验证收益。',
    guidedPractice: '将非首屏路由改为动态 import，检查构建后的 chunk 图；为带哈希资源设置长期缓存、为 index.html 设置短缓存，再用 Lighthouse 记录 LCP、CLS 与 INP 基线。',
    independentPractice: '为一个复杂表格做按需加载，要求首屏不下载编辑器依赖、切回页面不重复拉取、弱网下显示加载失败恢复，并提交优化前后的包体与指标对照。',
    commonErrors: [
      '把首屏关键组件全部改成异步，结果只是增加加载瀑布而没有减少必要内容。',
      '只优化 JS 体积，不处理图片尺寸、字体阻塞和布局跳动，LCP 与 CLS 仍超标。',
    ],
    sourceRefs: [
      'Vite Guide: Build and Code Splitting. https://vite.dev/guide/build.html',
      'web.dev: Core Web Vitals. https://web.dev/articles/vitals',
      'Vue Router: Lazy Loading Routes. https://router.vuejs.org/guide/advanced/lazy-loading.html',
    ],
    steps: [
      ['找到首屏必要图', '记录首屏 HTML、入口 JS、主样式、字体和首张真实内容图，区分关键与按需资源。路由使用动态 import，编辑器、图表和低概率弹窗可用 defineAsyncComponent；加载边界应有稳定占位，避免内容跳动。分割过细会增加请求链，查看 Network 瀑布和 chunk 图后按真实路径调整。', '先画资源瀑布再分割'],
      ['缓存按内容变', '构建产物哈希随内容变化，带哈希的 JS/CSS 可设 immutable 长缓存；index.html 必须短缓存或协商缓存，确保用户拿到新入口。服务端 API 缓存与浏览器缓存分开设计，带权限的数据默认不进入公共 CDN。修改一个组件后比较哈希和缓存头，确认新版本入口能引用新资源。', '内容哈希才有长期缓存'],
      ['LCP 与资源优先级', 'LCP 通常由首屏大图、标题或承载主内容的脚本决定，查 Performance 的 element timing 与服务器响应。压缩图片、预加载真实首图、避免懒加载首屏内容，并减少阻塞字体。Vue 应用首屏若依赖客户端请求，服务端渲染或预取可能比单纯拆包更有效；用同网络条件比较优化前后。', '优化真正被测量的元素'],
      ['INP 与长任务', '交互延迟受事件处理、渲染和主线程长任务影响。大列表使用分页或虚拟滚动，搜索输入去抖，避免每次按键重算大数组；把昂贵 JSON 解析拆到 worker 或服务端。用 Performance 记录从点击到下一帧的区间，区分网络等待和主线程计算，不能只看 Lighthouse 总分。', '交互性能看主线程'],
      ['CLS 与视觉稳定', '图片和广告位预留宽高，异步组件容器使用稳定尺寸，字体加载变化通过 font-display 和字体度量控制。按钮 loading 文案变化不能导致整行跳动。用真实移动网络和滚动过程录制布局偏移，修正后用同一脚本复测，避免只在宽屏开发机观察。', '异步加载也要稳定布局'],
    ],
  },
  {
    name: vueName(v4Stage, '错误监控与可访问性验收'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '能在 Vue 中安装插件、处理异步错误，并了解 WCAG 的基本要求。',
    goal: '建立覆盖 Vue 渲染、未处理 Promise 和资源失败的监控，同时把键盘、对比度、缩放与辅助技术验收纳入发布门禁。',
    guidedPractice: '用 app.config.errorHandler、window error 与 unhandledrejection 记录带 release 和路由的错误，接入测试监控平台；再对页面运行 axe 检查并手工走一遍键盘流程。',
    independentPractice: '为关键页面建立错误告警与无障碍清单，要求 source map 可控、日志不含 token、错误有用户恢复入口，并记录 axe、200% 缩放和屏幕阅读器结果。',
    commonErrors: [
      '只捕获 try/catch 内的错误，遗漏事件回调、Promise rejection 和 Vue 生命周期异常。',
      '自动 axe 没有报错就认为页面可访问，未验证键盘顺序、焦点和动态播报。',
    ],
    sourceRefs: [
      'Vue 3 API: errorHandler. https://vuejs.org/api/application.html#app-config-errorhandler',
      'Sentry Vue Guide. https://docs.sentry.io/platforms/javascript/guides/vue/',
      'WCAG 2.2 Quick Reference. https://www.w3.org/WAI/WCAG22/quickref/',
    ],
    steps: [
      ['错误采集入口', 'Vue 的 app.config.errorHandler 能接收组件渲染、生命周期和事件中的未捕获异常；window 的 error 与 unhandledrejection 补足框架外错误，资源失败可用 capture 监听。统一转换成 eventId、release、route、组件名和脱敏上下文。不要记录表单全文、Authorization 或用户隐私。', '框架内外错误都要收口'],
      ['source map 与版本', '生产堆栈需要 source map 还原，但 map 不应公开给所有用户。上传到监控平台后删除或限制访问，并用 release 与构建 digest 关联源码。错误事件附 route 和 release 后，才能判断是新版本回归还是局部用户环境。发布前做一次受控异常演练，确认平台能收到并还原。', '版本与源码映射要关联'],
      ['告警与用户恢复', '错误率、特定 chunk 加载失败和关键接口异常应有阈值告警，通知包含影响页面、版本和样本。用户界面显示可重试、返回或联系入口，而不是永远转圈。监控数量不替代恢复动作：错误发生后能继续完成主流程，才是可用的容错。', '告警要连接到恢复动作'],
      ['自动可访问性扫描', 'axe-core 能发现缺少名称、错误 ARIA、对比度和结构问题，但无法证明焦点顺序、语义流程和动态播报正确。在组件测试与 Playwright 中对关键页面运行扫描，把已知例外登记原因与负责人，不能让全站忽略规则。', '自动扫描只是第一层'],
      ['人工键盘与屏幕阅读器', '只用键盘完成搜索、筛选、打开弹层、提交和关闭，确认焦点可见、无陷阱、关闭后返回触发点。检查 200% 缩放、减少动画和色弱模式，使用 NVDA、VoiceOver 等至少一种真实辅助技术抽查。动态错误和成功消息要通过 aria-live 被播报且不重复。', '真实辅助技术必须抽查'],
    ],
  },
];

// ── V5 Nuxt SSR、部署与运行 ──────────────────────────────────────────────────
const v5Stage = 'Nuxt SSR、部署与运行';

const VUE3_V5_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: vueName(v5Stage, 'SPA、SSG、SSR 与混合渲染'),
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已完成 Vue Router 与 Vite 构建学习，知道 HTML、JavaScript 和 HTTP 缓存的关系。',
    goal: '按首屏、SEO、个性化与运维成本选择 SPA、SSG、SSR 或混合渲染，并能用 Nuxt 路由规则表达选择。',
    guidedPractice: '在 Nuxt 中把首页设为 prerender、商品页设为 SSR、后台工作台设为 client-only，构建后分别查看首屏 HTML、服务端日志和浏览器接管行为。',
    independentPractice: '为三个业务页面写渲染选型表，说明数据新鲜度、SEO、权限、缓存和故障影响，并配置对应 routeRules 验证实际输出。',
    commonErrors: [
      '页面没有 SEO 与慢首屏问题却默认全站 SSR，增加服务器与会话隔离成本。',
      '把需要用户登录的个性化页面预渲染成公共静态页，造成数据泄露或内容过期。',
    ],
    sourceRefs: [
      'Nuxt Rendering Modes. https://nuxt.com/docs/guide/concepts/rendering',
      'Nuxt Route Rules. https://nuxt.com/docs/api/nuxt-config#routerules',
    ],
    steps: [
      ['SPA 的边界', 'SPA 由浏览器下载入口脚本，再由 Vue Router 渲染页面，服务器只提供静态资源；首屏依赖 JS 与客户端请求，SEO 和慢设备体验较弱，但部署简单。适合登录后台、交互密集且不需要搜索引擎收录的应用。验证时关闭 JavaScript，页面应有合理空壳，再记录首屏脚本、接口和 hydration 成本。', 'SPA 把渲染交给浏览器'],
      ['SSG 的构建时内容', 'SSG 在构建或预渲染阶段生成 HTML，CDN 可直接返回，首屏和 SEO 好且运行成本低。内容必须在构建时可获得，频繁变化的数据会过期；发布新内容需要重新构建或采用增量再生成。为文章、营销页和公开目录使用 SSG，并记录构建输入、缓存版本与失效方式，避免旧 HTML 引用已删除资源。', '静态化的前提是内容可预知'],
      ['SSR 的请求时渲染', 'SSR 在服务器按请求执行 Vue 与数据获取，返回带内容和序列化状态的 HTML，浏览器再 hydrate 接管交互。它能按用户和实时数据渲染，但服务器要处理超时、并发、缓存和请求隔离。把 SSR 仅当性能银弹会忽略 Node 进程成本；用服务端耗时、TTFB、错误率和客户端指标共同评估。', 'SSR 把首屏计算前移'],
      ['混合路由与规则', 'Nuxt 的 routeRules 可按路径设置 prerender、swr、isr、ssr:false 或缓存头，使公开页静态化、登录页由服务端渲染、编辑器仅客户端运行。规则越细越要测试真实构建输出，因为父路径与动态参数可能重叠。构建后请求每个代表 URL，检查服务端 HTML、响应头和 Network 中是否出现预期载荷。', '按页面风险分配渲染形态'],
      ['选型验证', '给每个方案记录首次内容出现时间、构建时长、部署复杂度、数据过期窗口、SEO 需求和故障影响，再选最小满足项。无个性化且可预生成就优先 SSG；必须实时个性化才用 SSR；纯后台可接受客户端渲染。最终不仅跑本地 dev，还要在目标 Node 或静态托管环境验证缓存、404 与回滚。', '选择由约束而非潮流决定'],
    ],
  },
  {
    name: vueName(v5Stage, '服务端数据获取和请求状态隔离'),
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '会使用 Nuxt useFetch 或 useAsyncData，并了解服务端请求并发与 cookie。',
    goal: '在服务端和客户端一致地获取数据，掌握 useAsyncData 的 key、去重、错误处理和每请求状态隔离。',
    guidedPractice: '在 Nuxt 页面用 useAsyncData 请求商品列表，设置唯一 key，分别打印服务端和客户端调用次数；再用两个带不同 cookie 的并发请求检查服务端状态没有共享。',
    independentPractice: '实现列表与详情两个页面，要求服务端预取、客户端导航复用数据、401 与 500 有不同错误页，并能在并发用户请求下不串会话。',
    commonErrors: [
      '在模块顶层创建可变请求状态，所有服务端请求共享同一用户或筛选。',
      'useAsyncData 使用重复或缺少参数的 key，导航后复用了错误缓存数据。',
    ],
    sourceRefs: [
      'Nuxt Data Fetching. https://nuxt.com/docs/getting-started/data-fetching',
      'Nuxt useAsyncData. https://nuxt.com/docs/api/composables/use-async-data',
      'Nuxt useState. https://nuxt.com/docs/api/composables/use-state',
    ],
    steps: [
      ['服务端请求上下文', 'Nuxt 在 SSR 时为每个请求创建上下文，event、headers、cookie 和 useState 应按请求隔离。模块级 let currentUser 或普通全局对象会被不同用户共享，是严重的数据串线风险。请求内可通过 useRequestEvent 读取头部，状态用 useState 或单次 useAsyncData 返回，不能把敏感值挂到 window。', '请求上下文必须独立'],
      ['useAsyncData 的 key', 'useAsyncData 的第一个参数是缓存 key，应包含路由 id、筛选和语言等影响响应的值；不传 key 时 Nuxt 会生成稳定但不易读的标识。服务端获取的数据会序列化给客户端，hydration 后同 key 可复用而不重复请求。key 冲突会让详情 A 显示详情 B，测试时应直接检查 key 与响应。', 'key 唯一且包含输入'],
      ['延迟与去重', 'useAsyncData 提供 pending、status、error、refresh 与 execute 等状态，服务端默认等待主要数据完成，客户端可在导航时自动复用。需要延迟请求时用 lazy，但必须处理骨架与后续导航。同一 key 的并发调用会被去重，两个语义不同请求误用同 key 则会被错误合并。', '并发去重依赖正确 key'],
      ['错误与状态码', '数据获取失败时要根据服务端状态设置 404 或 500，而不是所有失败都返回 200。useAsyncData 的 error 与 createError 可控制页面，客户端导航还要显示可重试提示。日志记录 requestId、路由与状态码，不记录 cookie。用不存在 id、权限拒绝和上游超时三组请求检查页面与 HTTP 响应。', '错误要变成正确 HTTP 状态'],
      ['会话与缓存隔离', '带 cookie 的请求不能被公共缓存；从服务端传递 token 到客户端时要使用安全 cookie 和受控载荷。需要用户菜单等多次使用的小状态，用 useState 并在同一请求内初始化，禁止把另一个请求的 Promise 保存到模块作用域。并发两个不同账号的浏览器会话，检查 HTML 标题、用户名和权限按钮。', '同请求可共享跨请求禁止共享'],
    ],
  },
  {
    name: vueName(v5Stage, 'hydration、客户端接管和错误'),
    track,
    contentStatus: 'reviewed',
    minutes: 45,
    prerequisite: '理解 SSR 返回 HTML，知道浏览器端 Vue 会在已有 DOM 上建立响应式实例。',
    goal: '解释 hydration 的匹配过程，定位文本、属性和结构不一致，使用客户端边界与恢复策略避免首屏闪烁和状态错乱。',
    guidedPractice: '制造三个 hydration mismatch：服务端与客户端时间不同、渲染读取 localStorage、随机 key 变化；记录 Vue 警告、DOM 差异与修复方式。',
    independentPractice: '给一个含图表和用户区域的页面加 ClientOnly 与稳定初始状态，要求 SSR 首屏有真实内容、客户端接管无警告、图表失败有错误提示。',
    commonErrors: [
      '在 setup 或模板渲染阶段直接读取 window、localStorage 或 Date.now，导致两端输出不同。',
      '用 ClientOnly 包裹所有首屏内容，表面消除警告但失去 SSR 的首屏与 SEO 收益。',
    ],
    sourceRefs: [
      'Nuxt Rendering: Hydration. https://nuxt.com/docs/guide/concepts/rendering#hydration',
      'Vue 3 Hydration. https://vuejs.org/guide/scaling-up/ssr.html#hydration',
      'Nuxt ClientOnly. https://nuxt.com/docs/api/components/client-only',
    ],
    steps: [
      ['HTML 与 vnode 对齐', 'SSR 先输出 HTML，浏览器加载客户端 bundle 后，Vue 按同一组件树读取服务端节点并附加事件与响应式状态，而不是全部重建。若标签层数、文本、属性或 key 不匹配，hydration 会报错并可能回退客户端重建。查看警告中的父组件和 DOM 路径，比较服务端 HTML 与接管后 DevTools 结构。', '两棵树必须稳定一致'],
      ['非确定性来源', 'Date.now、Math.random、浏览器语言、时区、localStorage、window 尺寸与授权状态在服务端和客户端可能不同。首屏渲染应使用服务端传入的序列化值，确需客户端数据时先渲染稳定占位，在 onMounted 后更新。把非确定性值移到事件或 effect 中，并加 hydration 回归测试。', '首屏只渲染可预测值'],
      ['ClientOnly 的正确边界', '对于必须访问浏览器 API 的组件，可用 ClientOnly 提供 fallback，再在客户端挂载。它适合地图、绘图和第三方窗口组件，不应包裹整个正文。fallback 要有稳定尺寸和可读提示，避免内容跳变；同时确保搜索引擎和服务端仍能看到关键标题、价格和说明。', '只隔离必须依赖浏览器的部分'],
      ['状态序列化与安全', 'SSR 返回的 payload 会进入浏览器，不能包含秘密、完整用户对象或服务端内部堆栈。需要恢复的状态应是可序列化的普通数据，Date、Map 和 undefined 需显式转换。对后端注入的序列化脚本防范闭合标签攻击，敏感 cookie 保持 HttpOnly。检查 HTML 源码中是否出现 token。', '序列化数据等同发给浏览器'],
      ['恢复与降级', 'hydrate 失败时应用应仍能继续运行或显示可恢复错误，不能在白屏和控制台警告间循环。监控记录 release、路由与 mismatch 组件名，生产可使用客户端重建作为兜底，但必须修复根因。用慢 CPU、禁用 JS 和网络中断分别验证首屏与接管后的可用性。', '兜底不能代替根因修复'],
    ],
  },
  {
    name: vueName(v5Stage, '缓存、CDN、Node 与边缘部署'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解 HTTP 缓存头、SSR 请求和 Nuxt routeRules，能部署 Node 服务。',
    goal: '根据数据共享范围设计浏览器、CDN 与源站缓存，区分 Node 与边缘运行限制，并验证缓存命中、失效和用户隔离。',
    guidedPractice: '为公开目录设置 Cache-Control 与 stale-while-revalidate，为登录响应设置 private 或 no-store；在 CDN 与本地 Node 两种环境请求同一路径，记录 age、cache status 和源站日志。',
    independentPractice: '部署一个 Nuxt 应用，将公开页放 CDN、动态页放 Node，带有用户信息的请求禁止公共缓存，并完成一次内容更新后的定向清理与验证。',
    commonErrors: [
      '给所有 HTML 统一设置长缓存，发布后用户长时间看到旧版本。',
      '在 CDN 缓存中忽略 Authorization 或 Cookie，导致一个用户的数据被另一个用户命中。',
    ],
    sourceRefs: [
      'Nuxt Deployment. https://nuxt.com/docs/getting-started/deployment',
      'Nuxt Route Rules. https://nuxt.com/docs/api/nuxt-config#routerules',
      'MDN HTTP Caching. https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching',
    ],
    steps: [
      ['按响应共享范围缓存', '浏览器缓存、CDN 缓存和源站缓存针对不同层，Cache-Control: public 表示响应可被共享缓存，private 只允许用户浏览器，no-store 禁止存储。含 cookie 或授权的个性化页面必须 private 或 no-store；公开目录可以使用 s-maxage、stale-while-revalidate。缓存策略先按用户和数据分类，再谈秒数。', '先判断能否共享'],
      ['内容哈希与入口缓存', '带内容哈希的静态资源可 immutable 长缓存，HTML 入口应短缓存或协商缓存，确保部署后能拿到新资源。CDN 可能缓存旧 index.html，从而引用已清理的旧 chunk；发布时需保留短过渡期资源或主动 purge。用 x-cache/age 响应头和两次请求验证命中，再刷新内容确认失效。', '入口与资源缓存周期不同'],
      ['CDN 与边缘限制', 'CDN 缓存静态资源与可共享 HTML，边缘函数适合轻量重写、地理规则和短请求，但运行时长、内存、包体和网络 API 有限。数据库连接、文件系统和需要本地缓存的长时间任务通常放 Node 服务。部署前查目标平台限制，用错误日志验证超时和冷启动行为。', '边缘不是缩小版全功能服务器'],
      ['Node 运行与服务配置', 'Nuxt Node 构建需要正确的启动入口、端口、环境变量和健康检查；反向代理要传递真实客户端 IP 时只信任受控代理。每实例内存与并发要压测，SSR 重页面不能让事件循环长时间阻塞。用容器或进程管理器处理退出信号、优雅停机和日志 stdout。', 'Node 负责动态渲染与受限缓存'],
      ['缓存失效与发布', '内容更新后只清理相关路径，版本发布使用新构建 ID 并让入口指向新资源；全站 purge 可能造成流量回源尖峰。对于 stale 内容要接受短暂旧值还是立即失效，由业务决定。记录 purge 时间、路径、CDN 返回和源站版本，验证浏览器与匿名会话都获得正确内容。', '失效范围要可审计'],
    ],
  },
  {
    name: vueName(v5Stage, '健康检查、日志和错误监控'),
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '能部署 Node/Nuxt 服务，理解进程存活、HTTP 状态码和结构化日志。',
    goal: '为 Nuxt 服务设计轻量健康检查、结构化日志与错误监控，能将失败关联到版本、实例和请求。',
    guidedPractice: '添加 /healthz 存活检查与 /readyz 就绪检查，让后者验证必要依赖但不做重查询；输出包含 requestId、route、status、duration 和 release 的 JSON 日志。',
    independentPractice: '为一个 Nuxt 部署接入错误监控，制造启动未就绪、API 超时和前端 hydration 错误，要求告警能指出实例、版本和请求链路，并提供恢复入口。',
    commonErrors: [
      '存活检查每次执行昂贵数据库查询，依赖抖动导致所有实例被重启。',
      '日志只输出自由文本且不带 requestId，无法串联前端错误、SSR 和上游 API。',
    ],
    sourceRefs: [
      'Kubernetes Documentation: Configure Liveness, Readiness and Startup Probes. https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/',
      'Nuxt Deployment. https://nuxt.com/docs/getting-started/deployment',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      ['三种探针职责', 'liveness 只判断进程是否还能工作，失败通常触发重启；readiness 判断是否可接流量，依赖未恢复时暂时摘除；startup 为慢启动留时间。健康接口应快速、无敏感信息，不执行昂贵业务查询。将探针路径排除在公共缓存和登录之外，并分别模拟进程卡死、依赖暂时不可用和启动较慢。', '存活与就绪不要混用'],
      ['结构化请求日志', '服务端为每个请求生成 requestId，记录 method、route 模板、status、duration、release、实例和上游耗时，避免记录查询中的个人信息与完整 cookie。日志使用 JSON 便于检索和聚合；错误栈单独带 eventId。前端错误可复用 response 的 requestId 与服务端日志串联。', '一条请求要能串起三端'],
      ['错误边界与告警', 'Vue errorHandler、服务端渲染异常和上游请求失败分别采集并标记来源，告警按用户影响、错误率和持续时间分等级。对已知的用户输入错误记录为业务事件而非告警风暴。通知中带处理链接、版本、样本与停止开关位置；告警无人负责就不能算完成。', '告警必须有负责人和动作'],
      ['指标与容量', '监控 SSR 请求 p50/p95、正在处理数、内存、事件循环延迟、上游超时、缓存命中率和错误率。只有平均值会掩盖尾部体验；按路由标记重页面，防止首页指标掩盖详情页故障。用压测制造并发找出第一个饱和点，再调整实例与缓存策略。', '分位与路由级指标并看'],
      ['故障演练', '模拟 503、探针失败、源站超时和前端 chunk 404，确认编排系统、告警、用户提示与恢复步骤都执行。演练后删掉临时故障配置，检查没有持续告警。最终交付运行手册，包含正常指标、常见错误、检查命令和升级联系方式。', '演练过才算可运维'],
    ],
  },
  {
    name: vueName(v5Stage, 'Nuxt 发布与回滚实验'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '完成 Nuxt 构建、部署、缓存与监控学习，能操作测试环境发布流程。',
    goal: '使用不可变构建制品、渐进流量和兼容迁移完成 Nuxt 发布，验证快速回滚且不破坏缓存与数据兼容性。',
    guidedPractice: '构建两个带内容哈希的 Nuxt 版本，使用反向代理或平台流量权重发布 10% 新版本；观察错误率与 p95 后扩大流量，再执行一次版本回退。',
    independentPractice: '完成蓝绿或金丝雀发布演练，包含数据库迁移兼容、CDN 入口切换、健康检查、冒烟测试和回滚判定，记录从发现异常到恢复服务的每一步。',
    commonErrors: [
      '只回滚 Node 镜像，不回滚 CDN 规则和环境变量，恢复后行为仍与新版本一致。',
      '新版本先执行不可逆数据库迁移，旧版本回滚后无法读取数据。',
    ],
    sourceRefs: [
      'Nuxt Deployment. https://nuxt.com/docs/getting-started/deployment',
      'Google SRE Workbook: Canarying Releases. https://sre.google/workbook/canarying-releases/',
      'Kubernetes Documentation: Deployments. https://kubernetes.io/docs/concepts/workloads/controllers/deployment/',
    ],
    steps: [
      ['不可变制品', '每次构建生成唯一 releaseId，产物、依赖锁、环境变量键名、CDN 规则和数据库迁移都绑定该版本；不要用 latest 标签在原目录覆盖。制品应可校验哈希并能从制品库重新部署。记录 releaseId 与 commit、构建日志和监控 release，才能回滚到可证明状态。', '发布的是可追溯制品'],
      ['渐进流量', '蓝绿先保留旧实例，金丝雀先导 1%、10%、50% 流量，按错误率、p95、hydration 错误和业务成功率停下或扩大。冒烟测试至少覆盖首页、登录、关键数据和静态资源。小流量异常也可能是新版本问题，阈值需在发布前约定，不能现场凭感觉。', '先小流量再扩大'],
      ['数据与配置兼容', '采用 expand 与 contract 思路：先增加兼容字段并部署读写新旧格式的代码，确认后迁移数据，最后在新版本稳定后再删除旧字段。环境变量和 cookie 名称也要双读一段时间。回滚演练前确认旧版本仍能读取当前数据，否则代码回滚无法完成恢复。', '先兼容再迁移最后清理'],
      ['切换与缓存', '入口 HTML、CDN 规则、服务实例和后台任务必须按顺序切换，静态哈希资源在两版本共存期保留。回滚时要恢复旧 HTML 指向的旧 chunk，不能只换服务端进程。记录切换操作、时间、操作者与验证响应，避免发布脚本失败后处于半新半旧状态。', '代码配置缓存一起回滚'],
      ['健康与冒烟验收', '流量切换前检查 readiness，切换后从外部探测真实 URL，完成登录和关键 API 的冒烟路径。浏览器加载新 HTML、旧缓存 HTML 和直接深链三种情况都要验证。错误率超阈值自动停止放量，只有明确审批才继续。', '验证从用户入口出发'],
    ],
  },
];

// ── V6 Vue 源码：响应式、渲染器、调度与编译 ──────────────────────────────────
const v6Stage = 'Vue 源码：响应式、渲染器、调度与编译';

const VUE3_V6_BASE: readonly ProgrammingCourseSeed[] = [
  {
    name: vueName(v6Stage, '源码仓库、版本和阅读入口'),
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '会使用 Git、pnpm workspace 和源码编辑器跳转，能运行项目测试。',
    goal: '固定 Vue 源码版本，掌握仓库包结构与阅读工具，能从官方 tag 复现问题并把符号定位到发布产物。',
    guidedPractice: '克隆 vuejs/core 并检出课程指定的 v3.5 标签，执行 pnpm install 与相关包测试；用快捷键跳转 packages/reactivity 到 runtime-core 再到 vue 包出口。',
    independentPractice: '为一个运行时版本问题建立源码档案：记录 commit、Node/pnpm 版本、复现测试、相关符号、堆栈和构建产物版本，并验证切换一个补丁版本后行为是否仍存在。',
    commonErrors: [
      '直接在 main 分支阅读源码，却用它解释项目中固定的 Vue 版本行为。',
      '只看 packages/vue/src/index.ts 的出口，不知道 reactivity 与 runtime-core 由不同包实现。',
    ],
    sourceRefs: [
      'vuejs/core repository. https://github.com/vuejs/core',
      'Vue 3 Contribution Guide. https://github.com/vuejs/core/blob/main/.github/CONTRIBUTING.md',
      'Vue 3 Release Tags. https://github.com/vuejs/core/tags',
    ],
    steps: [
      ['先固定再阅读', '从项目 package.json 或锁文件确认 Vue 精确版本，再到官方 tag 找到对应提交；主分支可能包含尚未发布的实验改动。记录 commit、依赖安装命令和测试环境，不把最新博客直接当作当前版本事实。源码结论必须能回到用户实际运行的版本，必要时也用包管理器解析结果确认没有重复实例。', '版本是所有源码结论的前提'],
      ['仓库包结构', 'packages/reactivity 实现 ref、reactive、effect、computed 与依赖图；packages/runtime-core 管组件、vnode、renderer 和 scheduler；packages/runtime-dom 对接浏览器 DOM；packages/compiler-core 处理模板编译。packages/vue 是运行时与编译器的统一出口。先确认问题落在哪个包，再搜索符号，避免在编译层寻找运行期调度问题。', '按职责包定位入口'],
      ['源码与发布映射', '开发源码通常使用 TypeScript，npm 发布包经过构建，函数名可能被压缩或通过导出重定向。利用 source map、Vue 包 exports 和浏览器堆栈判断运行文件对应哪个源码符号。不要仅凭错误信息中的 minified 名称搜源码；可在测试构建或未压缩产物中复现同一堆栈。', '运行堆栈要对上源码符号'],
      ['建立可运行实验', '优先在对应包的测试目录写最小用例，使用仓库已有 Vitest 配置和辅助函数，避免复制大量内部实现。测试应只触发目标行为，例如 effect 重跑次数或 patch 调用，不依赖无关快照。记录失败、预期和修复前后结果；若不能修改源码，就在项目小样中提供对照版本。', '一个最小实验胜过整仓猜测'],
      ['阅读工具与证据', '使用编辑器的 workspace 搜索、Go to Definition、Find References 和类型跳转，配合 git blame 查看引入原因。阅读提交信息、测试和 issue 时区分事实与个人解释；源码注释和测试通常比二手文章更接近约束。把调用路径、关键分支、输入输出和版本差异写进笔记，而不是只贴行号。', '调用路径要可复核'],
    ],
  },
  {
    name: vueName(v6Stage, 'effect、track 与 trigger'),
    track,
    contentStatus: 'reviewed',
    minutes: 44,
    prerequisite: '理解 Proxy，能阅读 TypeScript 泛型和 Map/WeakMap 数据结构。',
    goal: '沿 ReactivityEffect 追踪一次依赖收集、触发与清理，解释 activeEffect、targetMap 和 scheduler 如何协同。',
    guidedPractice: '在课程对应源码中定位 effect、track、trigger 和 cleanupEffect，断点运行一个 ref 与 reactive 测试，记录依赖表键、effect 集合和重跑顺序。',
    independentPractice: '给一段带条件分支的 computed/watch 示例画出依赖图，制造依赖切换并说明 cleanup 前后的新旧集合，再用最小测试证明旧分支写入不再触发。',
    commonErrors: [
      '认为 track 会订阅对象所有属性，忽略具体属性与迭代器相关 dep。',
      '只观察 trigger 找到依赖，却不检查每次执行前是否清理上一轮依赖。',
    ],
    sourceRefs: [
      'vuejs/core effect.ts. https://github.com/vuejs/core/blob/main/packages/reactivity/src/effect.ts',
      'vuejs/core dep.ts. https://github.com/vuejs/core/blob/main/packages/reactivity/src/dep.ts',
      'Vue Reactivity in Depth. https://vuejs.org/guide/extras/reactivity-in-depth.html',
    ],
    steps: [
      ['activeEffect 的进入与退出', 'effect 执行前把自身设为 activeEffect，嵌套 effect 需要保存 previousEffect 并在 finally 恢复，异常也不能破坏全局栈。响应式属性读取时若 activeEffect 存在，track 才把当前 effect 加入依赖。没有活动消费者时读取不会建边；用递归 effect 或 watch 内读取测试验证恢复顺序。', '活动副作用必须在 finally 恢复'],
      ['targetMap 的结构', 'targetMap 用 WeakMap 保存原始对象到 depsMap，depsMap 再用属性 key 找到 dep 集合。WeakMap 让目标对象不可达时可回收，但 dep 中的 effect 也需要清理。数组的 length、索引与 ITERATE_KEY 可能分别建边；观察 push 和遍历时哪些 dep 被 trigger，能把迭代语义和普通属性区分开。', '对象、属性、effect 三层索引'],
      ['track 的精确订阅', 'track 根据 target 和 key 创建或复用 dep，并让 dep.track 记录当前 effect；嵌套 effect 同时属于多个 dep。若同一 effect 因条件分支不再读取某属性，cleanup 会把它从旧 dep 移除。只在全局变量记录当前 effect 而不维护依赖集合，就无法实现精确通知；测试应打印每个 dep 的 effect 数量。', '订阅关系必须可移除'],
      ['trigger 的候选调度', 'trigger 根据 key 找到 dep，并复制待执行 effect，避免执行过程中修改集合造成遍历异常。每个 effect 的 scheduler 决定立即执行还是入队，computed 与组件更新都利用这层调度。trigger 不保证每次写入都同步跑完所有渲染；观察 scheduler 队列与最终 DOM 才能理解批处理。', '触发先把工作交给调度'],
      ['cleanup 与依赖切换', 'effect 重跑前调用 cleanupEffect 移除上一轮 dep，再重新执行并收集。条件分支从 a 切到 b 后，写 a 不应再触发；若忘记 cleanup，副作用会积累并访问过期状态。对 watch 的异步回调还要注意依赖收集窗口，await 后读取不一定进入同一 effect。', '每轮执行重建依赖集合'],
    ],
  },
  {
    name: vueName(v6Stage, 'renderer 的 mount 与 patch'),
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '理解虚拟节点、DOM 操作和组件生命周期，能阅读 renderer 的 switch 分支。',
    goal: '沿 createVNode 到 mountElement、mountComponent 与 patch 追踪首次渲染和更新，解释 key、patchFlag 和 host 操作的作用。',
    guidedPractice: '在 renderer.ts 定位 patch 的节点类型分支，用断点观察一个父子组件首次 mount 的 createElm、setElementText 与 props patch；再更新文本和 key 列表，记录 DOM 操作。',
    independentPractice: '为一个列表更新实验记录 key 稳定与索引 key 两种 DOM 操作差异，画出 patchElement 与 patchChildren 的路径，并说明组件更新和原生元素更新的边界。',
    commonErrors: [
      '把虚拟节点对象当成真实 DOM，修改字段后期待页面直接改变。',
      '认为有 key 就永远不移动节点，忽略 key 只提供身份匹配而非克隆 DOM。',
    ],
    sourceRefs: [
      'vuejs/core renderer.ts. https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts',
      'vuejs/core vnode.ts. https://github.com/vuejs/core/blob/main/packages/runtime-core/src/vnode.ts',
      'Vue Rendering Mechanism. https://vuejs.org/guide/extras/rendering-mechanism.html',
    ],
    steps: [
      ['vnode 到 host element', '模板编译或手写 h 生成 VNode，renderer 的 render 把 VNode 交给 patch。首次 mount 时，元素类型节点通过 hostCreateElement 创建 DOM，设置 props、文本和子节点；组件节点先创建实例作用域再渲染子树。patch 只负责比较和选择操作，浏览器 API 由 runtime-dom 提供的 host 适配器封装。', 'VNode 是描述不是 DOM'],
      ['mount 的递归边界', 'mountElement 挂载宿主节点，mountChildren 递归处理数组子节点，mountComponent 执行 setup、render 和生命周期；每个分支都必须处理空值、文本、Fragment 等类型。遇到未知 VNode 类型会进入警告或错误路径。用断点记录节点类型、子节点数量和最终 parentNode，确认每一步对应哪段 DOM。', '每种节点类型有独立路径'],
      ['patchElement 的属性与子节点', '更新同类型元素时，renderer 比较新旧 props，删除旧属性、增改新属性，再 patchChildren。文本子节点可以直接更新 textContent，数组子节点需要 diff；事件监听也会按 invokers 策略替换或移除。修改一个 class 与替换整个元素是不同路径，用 Performance 与 DOM 断点观察。', '属性和 children 分开比较'],
      ['keyed children 的身份', 'patchKeyedChildren 先处理公共前缀和后缀，再建立 key 到索引的映射完成移动与新增删除。稳定业务 id 能让节点身份保持一致，索引 key 在插入或排序时可能复用错误实例并破坏输入状态。用带输入框的列表实验：从头部插入一条，检查焦点和值跟随的是数据还是位置。', 'key 选择影响实例复用'],
      ['组件更新与 patchFlag', '组件 VNode 更新可能触发 shouldUpdate、setupRenderEffect 和 subtree patch；编译器生成的 patchFlag 告诉运行时哪些动态部分可能变化，从而跳过静态内容。手写 render 若 patchFlag 错误，Vue 可能不检查真实变化的字段，表现为页面不更新。调试时区分编译输出错误与运行时 patch 分支。', '优化标记也承担正确性边界'],
    ],
  },
  {
    name: vueName(v6Stage, 'scheduler 队列与批量更新'),
    track,
    contentStatus: 'reviewed',
    minutes: 44,
    prerequisite: '理解 Promise 微任务、组件 render effect，并能阅读队列和排序逻辑。',
    goal: '解释 queueJob 去重、排序、flushJobs 父级优先与 nextTick 共享刷新 Promise 的机制，能够诊断更新顺序和重复渲染。',
    guidedPractice: '在 scheduler.ts 定位 queueJob、queueFlush、flushJobs 与 nextTick，在多个父子组件同时改状态时记录 job id 顺序；比较同一轮多次写入与跨 nextTick 写入的渲染次数。',
    independentPractice: '构造 3 个组件按不同层级更新，预测并实测刷新顺序；再制造一个始终写入新值的 watch，说明递归更新限制为何触发、如何改为条件更新。',
    commonErrors: [
      '认为 nextTick 会等所有 Promise 和网络请求结束，实际上它只等当前调度任务完成。',
      '在 job 中无限修改依赖且不设终止条件，导致 maximum recursive updates 警告。',
    ],
    sourceRefs: [
      'vuejs/core scheduler.ts. https://github.com/vuejs/core/blob/main/packages/runtime-core/src/scheduler.ts',
      'Vue nextTick API. https://vuejs.org/api/general.html#nexttick',
    ],
    steps: [
      ['queueJob 去重', '组件更新或 watch 的调度器调用 queueJob，队列先检查是否已有同一 job；同一组件在同一轮多次依赖变化只保留一个待执行任务。job 的 id 用于排序，父组件通常先于子组件更新。若发现重复渲染，先判断是否跨了多次 flush，而不是看到两次日志就断言去重失效。', '同一队列内按身份去重'],
      ['微任务刷新', 'queueFlush 用 resolvedPromise.then 安排 flushJobs，使当前同步调用栈中的多次状态修改合并。flushJobs 清空队列时会处理执行期间新增的 job，排序后继续。异常可能中断后续任务，因此关键组件错误处理和测试很重要。用日志记录 microtask 前后和 flush 次数，能确认更新没有提前到同步阶段。', '微任务边界承担批量'],
      ['nextTick 共享 Promise', 'nextTick 注册在 currentFlushPromise 之后，调用多次会等待同一轮刷新，而不是各自建立一条无法解释的延迟链。DOM 更新完成后，Promise resolve，回调可读取新节点。它不保证图片加载或业务 fetch 完成；等待对象不同，错误地增加多个 nextTick 不会修复网络竞态。', '等待当前 flush 而非所有异步'],
      ['watch 与 pre/post 队列', '组件更新前需要执行的 watch 使用 pre 队列，DOM 更新后任务用 post 队列；它们在同一个 flush 周期中按阶段运行。sync watch 绕过批处理，在多次写入时立即执行，代价可能很高。选错 flush 会导致测量旧 DOM 或重复请求。用顺序日志记录状态写入、pre watch、render、post watch。', '调度阶段决定观察到的值'],
      ['递归更新上限', '一个 watch 每次执行都把依赖改成不同值，会不断排入新任务；Vue 用递归更新计数和警告阻止无限循环，而不是让浏览器永久卡死。修复应增加相等判断、缩小 watch 源或把写入放到显式事件。不要简单调高限制，问题往往在状态设计。测试中统计执行次数并断言最终收敛。', '递归保护不是性能开关'],
    ],
  },
  {
    name: vueName(v6Stage, 'template compiler 与 render 函数'),
    track,
    contentStatus: 'reviewed',
    minutes: 46,
    prerequisite: '会阅读 AST、正则和代码生成结果，能使用 Vue 的模板编译 API。',
    goal: '沿 baseParse、transform、generate 观察模板如何变成 render 函数，理解静态提升、patchFlag 和运行时 helper 的作用。',
    guidedPractice: '用 compile 对一段包含 v-if、v-for、class 绑定和插槽的模板编译，在控制台查看 code 与 ast；逐步删除动态部分，观察 hoist、patchFlag 和 helper 导入变化。',
    independentPractice: '手写一个与编译结果等价的简单 render 函数，比较 DOM 和更新行为，再设计一个模板边界案例说明编译器为何无法在构建期确定运行值。',
    commonErrors: [
      '把模板当 HTML 字符串插入 DOM，误以为浏览器能自动获得 Vue 的响应式表达式。',
      '手动复制编译产物但不导入对应 runtime helper，导致运行时报未定义函数。',
    ],
    sourceRefs: [
      'vuejs/core compiler-core. https://github.com/vuejs/core/tree/main/packages/compiler-core/src',
      'vuejs/core compile.ts. https://github.com/vuejs/core/blob/main/packages/compiler-core/src/compile.ts',
      'Vue Template Explorer. https://play.vuejs.org/',
    ],
    steps: [
      ['解析生成 AST', 'baseParse 把模板字符串解析成元素、文本、插值和指令节点，并记录源码位置。语法错误在解析阶段报出，例如未闭合标签或非法插值；而后面的绑定合法性还要靠 transform 检查。AST 是工具而非运行 DOM，调试时看 type、tag、props、children 和 loc，可以把错误缩到具体模板片段。', '先解析结构再检查语义'],
      ['transform 组合语义', 'transformIf、transformFor、transformElement、transformSlot 等转换节点处理指令、作用域和优化信息；v-if 与 v-for 的执行优先级由转换顺序决定。复杂嵌套模板若在 AST 阶段就出现结构不符合，生成阶段只会继续放大错误。通过 compile 的 onError 收集位置和错误码，修复模板后重新生成。', '指令由多轮转换落实'],
      ['代码生成与 helper', 'generate 把 AST 打印成 JavaScript，并收集 createElementVNode、toDisplayString、renderList 等 runtime helper 导入。手写 render 函数必须使用正确的 VNode 创建函数和组件解析方式，才能保留响应式与 patch 逻辑。查看 build 后模块的 import，确认 helper 与所用函数一一对应。', '模板逻辑落到 helper 调用'],
      ['静态提升与 patchFlag', '编译器会提升不变节点、缓存事件和标记动态 props，让运行时跳过静态子树。优化依赖编译器准确识别动态性；使用 v-html、运行时拼接或手写错误 patchFlag 会改变边界。比较同一模板在动态 class 前后生成的标志，并在页面更新一个字段验证跳过范围没有漏掉应更新的内容。', '优化标记必须匹配动态性'],
      ['作用域与边界', 'v-for 的 item、index，插槽 scope 和组件 setup 绑定在编译期形成不同访问路径，运行期通过闭包或缓存值取得。异步值、浏览器 API 和用户输入只能在运行时求值，编译器不会提前执行。用条件分支和本地变量测试，确认模板表达式没有意外依赖全局变量。', '编译期与运行期分工清楚'],
    ],
  },
  {
    name: vueName(v6Stage, 'Vue 企业应用毕业项目与源码答辩'),
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '完成 V0-V5 的应用、测试、性能和 Nuxt 学习，并能阅读 V6 源码与测试。',
    goal: '交付一个可运行、可测试、可观测、可回滚的 Vue/Nuxt 企业应用，并用固定版本源码解释一次真实更新链路。',
    guidedPractice: '选择一个含权限、路由、远程缓存、表单和 SSR 的小型业务，建立规格、威胁模型、性能预算和运行手册；用源码断点跟踪一次从提交筛选到 renderer patch 的完整链路。',
    independentPractice: '独立完成项目演示：正常流程、权限拒绝、请求竞态、hydration 失败、发布与回滚各演练一次，提交可复现命令、测试报告和源码答辩记录。',
    commonErrors: [
      '项目只展示顺利页面，没有权限、失败、性能与回滚证据。',
      '源码答辩只会贴函数名，无法解释当前版本中触发、调度与 DOM 更新的因果关系。',
    ],
    sourceRefs: [
      'Vue 3 Documentation. https://vuejs.org/guide/',
      'Vue 3 Core Source. https://github.com/vuejs/core',
      'Web Content Accessibility Guidelines 2.2. https://www.w3.org/TR/WCAG22/',
    ],
    steps: [
      ['交付范围与验收单', '选择一个范围小但链路完整的场景，例如订单查询与编辑，覆盖登录、路由、查询缓存、表单、SSR 或 SSR 降级。验收单逐条写用户动作、可观察结果、失败处理和证据文件，不以技术清单代替业务结果。先冻结接口、数据模型和权限边界，再进入实现。', '范围小但业务链路完整'],
      ['工程与安全证据', '项目必须有锁文件、类型检查、ESLint、组件测试、E2E、构建产物、性能预算、错误监控和不可变发布制品。权限既在路由层也在 API 层验证，秘密不进入 VITE_ 或 HTML payload。用泄露扫描、403 请求、hydration 警告和预算报告作为发布证据，缺一项就标缺口。', '每项质量要求都有证据'],
      ['源码链路答辩', '选定固定 tag，从页面事件或响应式写入出发，依次定位 effect 的依赖收集、scheduler 的排队、组件 render 调用、renderer patch 与最终 DOM 更新。每个节点给出源码符号、版本、断点和运行结果；如果经过 computed 或 watch，再说明缓存与 cleanup。不能仅凭函数名推测顺序。', '从业务动作追到真实 DOM'],
      ['性能与可访问性演示', '在桌面与移动设备录制冷启动、筛选、打开详情和慢网加载，报告 LCP、INP、CLS、请求数、chunk 大小和关键交互延迟。键盘完成同一流程，运行 axe 并人工检查焦点顺序与播报。性能或无障碍失败要有修复、复测和剩余风险，不用平均值掩盖长尾。', '用户指标与键盘路径一起演示'],
      ['发布、故障与回滚', '用 releaseId 和 digest 发布到测试环境，先小流量或蓝绿验证，再观察健康检查、错误率、p95 与业务成功率。注入一次上游超时和 hydration mismatch，展示告警、用户恢复、停止放量与版本回滚。回滚后确认 HTML、静态资源和 API 兼容，记录恢复时间。', '故障演练证明可运维'],
    ],
  },
];

const VUE3_EXAMPLE_SETS: Readonly<Record<string, readonly LearningV2LessonExample[]>> = {
  [vueName(v0Stage, 'Vue 与 Vite 的职责边界')]: [
    {
      title: '安装后核对 Vue 与 Vite 的真实版本和依赖位置',
      language: 'PowerShell',
      code: `pnpm create vite vue-vite-boundary --template vue-ts
Set-Location vue-vite-boundary
pnpm add vue
pnpm add -D vite @vitejs/plugin-vue
pnpm list vue vite @vitejs/plugin-vue --depth 0`,
      output: `dependencies:
vue 3.5.x
devDependencies:
@vitejs/plugin-vue 6.x
vite 7.x`,
    },
    {
      title: '用 HTTP 请求观察入口模块与转换后的 SFC',
      language: 'PowerShell',
      code: `pnpm dev --host 127.0.0.1 --port 5173
$html = Invoke-WebRequest http://127.0.0.1:5173/
$html.Content | Select-String 'src="/src/main.ts"'
$module = Invoke-WebRequest http://127.0.0.1:5173/src/App.vue
$module.Headers['Content-Type']
$module.Content.Substring(0, 120)`,
      output: `<script type="module" src="/src/main.ts"></script>
text/javascript
import { createElementVNode as _createElementVNode } ...`,
    },
    {
      title: 'HMR 下检查副作用是否在卸载时清理',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
const ticks = ref(0)
let timer = 0
onMounted(() => {
  timer = window.setInterval(() => ticks.value += 1, 1000)
  console.info('[vue-hmr] interval mounted', timer)
})
onBeforeUnmount(() => {
  window.clearInterval(timer)
  console.info('[vue-hmr] interval cleared', timer)
})
</script>
<template><p>ticks: {{ ticks }}</p></template>`,
      output: `[vue-hmr] interval mounted 1
HMR update accepted
[vue-hmr] interval cleared 1
[vue-hmr] interval mounted 2`,
    },
    {
      title: '区分构建时公开变量与运行时服务端配置',
      language: 'TypeScript',
      code: `// .env.production
// VITE_PUBLIC_API_BASE=https://api.example.test

const base = import.meta.env.VITE_PUBLIC_API_BASE
if (!base) throw new Error('VITE_PUBLIC_API_BASE is required')

export async function loadOrders() {
  const response = await fetch(base + '/orders')
  if (!response.ok) throw new Error('orders failed: ' + response.status)
  return response.json()
}

console.info('[build-env]', import.meta.env.MODE, base)`,
      output: `build-env production https://api.example.test
GET https://api.example.test/orders -> 200
ok 1 response parsed`,
    },
    {
      title: '开发、构建和预览三阶段证据链',
      language: 'PowerShell',
      code: `pnpm dev --host 127.0.0.1 --port 5173
# 浏览器修改 App.vue，确认状态保留并观察 hmr update
pnpm build
Get-ChildItem dist -Recurse -File | Select-Object FullName, Length
pnpm preview --host 127.0.0.1 --port 4173
Invoke-WebRequest http://127.0.0.1:4173/ | Select-Object StatusCode`,
      output: `VITE v7 ready in 221 ms
hmr update /src/App.vue
dist/assets/index-B7x2.js 148.42 kB
dist/assets/index-C91a.css 6.18 kB
StatusCode 200`,
    },
  ],
  [vueName(v0Stage, '从空目录创建入口和根组件')]: [
    {
      title: '最小 Vite Vue 入口文件',
      language: 'HTML',
      code: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue 空目录实验</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`,
      output: `200 GET /
200 GET /src/main.ts
200 GET /src/App.vue
DOM: #app > section.app-shell`,
    },
    {
      title: 'createApp 挂载根组件并暴露应用实例',
      language: 'TypeScript',
      code: `import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) {
  throw new Error('mount host #app is missing')
}

const app = createApp(App)
app.config.errorHandler = (error, instance, info) => {
  console.error('[vue-error]', info, error, instance?.$options.name)
}
app.mount(host)
console.info('[vue-mounted]', host.childElementCount)`,
      output: `[vue-mounted] 1
Vue DevTools: app "root" mounted
Elements: <div id="app" data-v-app="">...</div>`,
    },
    {
      title: '入口只安装路由、状态和错误监控',
      language: 'TypeScript',
      code: `import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { installErrorReporter } from './observability'

const app = createApp(App)
app.use(createPinia())
app.use(router)
installErrorReporter(app, { release: import.meta.env.VITE_RELEASE })
await router.isReady()
app.mount('#app')`,
      output: `pinia installed
router installed: 8 routes
error reporter release=2026.11.24
router ready before mount`,
    },
    {
      title: '挂载失败时给出可定位的选择器错误',
      language: 'TypeScript',
      code: `const selector = '#app'
const host = document.querySelector(selector)
if (!host) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<pre role="alert">Mount failed: #app is missing</pre>',
  )
  throw new Error('Vue mount host not found: ' + selector)
}
console.assert(host.children.length === 0, 'mount host should be empty')`,
      output: `Uncaught Error: Vue mount host not found: #app
role=alert text: Mount failed: #app is missing
Application did not render a blank page`,
    },
    {
      title: '用卸载验证根实例没有重复挂载',
      language: 'TypeScript',
      code: `import { createApp } from 'vue'
import { expect, it } from 'vitest'
import Root from './Root.vue'

it('mounts and unmounts one application', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(Root)
  app.mount(host)
  expect(host.querySelectorAll('[data-test="root"]')).toHaveLength(1)
  app.unmount()
  expect(host.innerHTML).toBe('')
  host.remove()
})`,
      output: `✓ mounts and unmounts one application
Test Files 1 passed (1)
Tests 1 passed (1)
after unmount innerHTML=""`,
    },
  ],
  [vueName(v0Stage, 'SFC、script setup 与 scoped CSS')]: [
    {
      title: '一个可编译的 script setup 单文件组件',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed, ref } from 'vue'
const price = ref(128)
const quantity = ref(2)
const total = computed(() => price.value * quantity.value)
</script>

<template>
  <article class="order-card">
    <h2>订单合计</h2>
    <output>{{ total.toFixed(2) }} 元</output>
  </article>
</template>

<style scoped>
.order-card { border: 1px solid #d0d5dd; padding: 16px; }
output { font-variant-numeric: tabular-nums; }
</style>`,
      output: `[vite] transform /src/OrderCard.vue
<article class="order-card" data-v-6f2c1a>...</article>
<style> .order-card[data-v-6f2c1a] { ... } </style>`,
    },
    {
      title: '异步 setup 明确等待 Suspense 边界',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
const response = await fetch('/api/courses')
if (!response.ok) throw new Error('course request failed')
const courses = (await response.json()) as Array<{ id: string; title: string }>
</script>

<template>
  <ul>
    <li v-for="course in courses" :key="course.id">{{ course.title }}</li>
  </ul>
</template>`,
      output: `Network GET /api/courses -> 200
Suspense fallback visible while pending
DOM renders 3 li nodes after resolve
Console has no unhandled rejection`,
    },
    {
      title: '父组件样式只能通过公开 class 命中子组件根节点',
      language: 'Vue SFC',
      code: `<!-- ParentCard.vue -->
<template>
  <BorderBox class="parent-spacing"><p>content</p></BorderBox>
</template>
<style scoped>
.parent-spacing { margin-block: 24px; }
</style>

<!-- BorderBox.vue -->
<template><section class="border-box"><slot /></section></template>
<style scoped>
.border-box { border: 2px solid #2563eb; }
</style>`,
      output: `section.border-box.parent-spacing[data-v-parent][data-v-child]
margin-block: 24px from parent scope
border from child scope
no :deep selector required`,
    },
    {
      title: '全局主题变量由入口声明，组件只消费',
      language: 'CSS',
      code: `/* src/style.css */
:root {
  --color-surface: #ffffff;
  --color-text: #182230;
  --space-card: 1rem;
}

/* CourseCard.vue */
<style scoped>
.card {
  padding: var(--space-card);
  color: var(--color-text);
  background: var(--color-surface);
}
</style>`,
      output: `Built CSS contains :root variables
Course card computed padding: 16px
Course card computed color: rgb(24, 34, 48)
No duplicate theme declaration in component`,
    },
    {
      title: '构建后确认模板、脚本和样式都进入产物',
      language: 'PowerShell',
      code: `pnpm build
$html = Get-Content dist/index.html -Raw
$html | Select-String 'assets/index-'
Get-ChildItem dist/assets -File |
  Select-Object Name, Length
Select-String -Path dist/assets/*.css -Pattern 'data-v-' |
  Select-Object -First 3`,
      output: `dist/assets/index-B2d1.js 91.42 kB
dist/assets/index-F8a3.css 12.17 kB
<link rel="stylesheet" href="/assets/index-F8a3.css">
data-v-6f2c1a appears in extracted CSS`,
    },
  ],
  [vueName(v0Stage, '模板表达式、绑定和事件')]: [
    {
      title: '模板插值只调用纯格式化函数',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed, ref } from 'vue'
const amount = ref(128.5)
const formatted = computed(() =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount.value),
)
</script>
<template><p aria-live="polite">应付：{{ formatted }}</p></template>`,
      output: `Initial text: 应付：¥128.50
Change amount to 99 -> 应付：¥99.00
No fetch or storage write during render
computed evaluated twice at most`,
    },
    {
      title: '布尔属性与组件 prop 分别核对',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref } from 'vue'
import SubmitButton from './SubmitButton.vue'
const submitting = ref(false)
const canSubmit = ref(true)
</script>
<template>
  <SubmitButton
    :disabled="!canSubmit"
    :busy="submitting"
    type="submit"
  >
    {{ submitting ? '保存中' : '保存' }}
  </SubmitButton>
</template>`,
      output: `Elements: button[type="submit"][disabled=""]
DevTools props: busy=false
Set canSubmit=true -> disabled attribute removed
Set submitting=true -> button text 保存中`,
    },
    {
      title: '静态 class 与动态 class/style 合并',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed, ref } from 'vue'
const active = ref(true)
const danger = ref(false)
const classes = computed(() => ({ active: active.value, danger: danger.value }))
const width = computed(() => ({ width: active.value ? '240px' : '120px' }))
</script>
<template>
  <div class="panel" :class="classes" :style="width">订单</div>
</template>`,
      output: `class="panel active"
style="width: 240px;"
Set danger=true -> class="panel active danger"
Set active=false -> style="width: 120px;"`,
    },
    {
      title: '函数引用与事件修饰符的可验证写法',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
function save() {
  count.value += 1
}
function onSubmit(event: SubmitEvent) {
  event.preventDefault()
  save()
}
</script>
<template>
  <form @submit.prevent="onSubmit">
    <button type="submit" @click.stop="save">保存</button>
    <output>{{ count }}</output>
  </form>
</template>`,
      output: `Click button -> count=1, submit not fired
Press Enter in form -> count increments once
Event target is form, not window
No page reload in Network panel`,
    },
    {
      title: '用原生按钮完成键盘可访问交互',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import CounterButton from './CounterButton.vue'

it('supports click and keyboard activation', async () => {
  const wrapper = mount(CounterButton)
  const button = wrapper.getByRole('button', { name: '增加一次' })
  await button.trigger('click')
  await button.trigger('keydown', { key: 'Enter' })
  expect(wrapper.get('output').text()).toBe('1')
  expect(button.attributes('type')).toBe('button')
})`,
      output: `✓ supports click and keyboard activation
button name: 增加一次
output text: 1
No div role=button in rendered HTML`,
    },
  ],
  [vueName(v0Stage, '开发服务器、构建产物与预览')]: [
    {
      title: '开发服务器按请求转换模块',
      language: 'PowerShell',
      code: `pnpm dev --debug --host 127.0.0.1 --port 5173
Invoke-WebRequest http://127.0.0.1:5173/src/main.ts |
  Select-Object StatusCode, Headers
Invoke-WebRequest http://127.0.0.1:5173/src/App.vue |
  Select-Object StatusCode`,
      output: `VITE ready in 186 ms
optimizing dependencies: vue
GET /src/main.ts 200 text/javascript
GET /src/App.vue 200 text/javascript
transform request took 7ms`,
    },
    {
      title: '构建后检查入口引用与哈希资源',
      language: 'PowerShell',
      code: `pnpm build
$html = Get-Content dist/index.html -Raw
$html
Get-ChildItem dist/assets -File |
  Sort-Object Length -Descending |
  Select-Object -First 5 Name, Length`,
      output: `<script type="module" crossorigin src="/assets/index-D3f9.js"></script>
<link rel="stylesheet" href="/assets/index-A7b2.css">
index-D3f9.js 142810
index-A7b2.css 9342`,
    },
    {
      title: '配置子路径 base 并重新构建',
      language: 'TypeScript',
      code: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/learning/',
  plugins: [vue()],
  build: {
    sourcemap: true,
    assetsInlineLimit: 4096,
  },
})

console.info('build base', '/learning/')`,
      output: `dist/index.html requests /learning/assets/index-D3f9.js
GET /learning/assets/index-D3f9.js -> 200
GET /assets/index-D3f9.js -> 404
source map emitted for production chunk`,
    },
    {
      title: '预览构建产物并验证回退路径',
      language: 'PowerShell',
      code: `pnpm preview --host 127.0.0.1 --port 4173
$root = Invoke-WebRequest http://127.0.0.1:4173/
$route = Invoke-WebRequest http://127.0.0.1:4173/orders/42
$asset = Invoke-WebRequest http://127.0.0.1:4173/assets/index-D3f9.js
@($root.StatusCode, $route.StatusCode, $asset.Headers['Content-Type'])`,
      output: `200
200
text/javascript; charset=utf-8
Preview server serves dist, not src/main.ts
Deep route falls back to index.html`,
    },
    {
      title: '记录产物预算并演练资源 404',
      language: 'PowerShell',
      code: `pnpm build | Tee-Object build.log
$limit = 250KB
$assets = Get-ChildItem dist/assets -File
$oversized = $assets | Where-Object Length -gt $limit
$assets | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}}
if ($oversized) { throw 'asset budget exceeded' }
Invoke-WebRequest http://127.0.0.1:4173/assets/missing.js`,
      output: `index-D3f9.js 139.5 KB within 250 KB budget
index-A7b2.css 9.1 KB within 250 KB budget
GET /assets/missing.js -> 404
Page shows retryable resource error, not endless loader`,
    },
  ],
  [vueName(v0Stage, '第一个可测试 Vue 页面')]: [
    {
      title: '从用户行为定义第一条组件测试',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import CounterPage from './CounterPage.vue'

it('increments the visible count after a click', async () => {
  const wrapper = mount(CounterPage)
  expect(wrapper.get('h1').text()).toBe('课程进度')
  await wrapper.getByRole('button', { name: '完成一课' }).trigger('click')
  expect(wrapper.get('output').text()).toBe('已完成 1 课')
})`,
      output: `✓ increments the visible count after a click
heading: 课程进度
button: 完成一课
output: 已完成 1 课`,
    },
    {
      title: '页面测试显式装配 Pinia 与 Router',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it } from 'vitest'
import ProgressPage from './ProgressPage.vue'

it('loads progress from an isolated store', () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ProgressPage }],
  })
  const wrapper = mount(ProgressPage, {
    global: { plugins: [createPinia(), router] },
  })
  expect(wrapper.get('[data-test="progress"]').text()).toContain('42%')
})`,
      output: `✓ loads progress from an isolated store
router route: /
pinia store created per test
progress text contains 42%`,
    },
    {
      title: '按状态阶段等待异步保存完成',
      language: 'Vue Test Utils',
      code: `import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import SavePanel from './SavePanel.vue'
import { saveCourse } from './api'

vi.mock('./api', () => ({ saveCourse: vi.fn() }))
it('shows pending then success', async () => {
  vi.mocked(saveCourse).mockReturnValue(new Promise(() => {}))
  const wrapper = mount(SavePanel)
  await wrapper.get('button').trigger('click')
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[role="status"]').text()).toBe('保存中')
})`,
      output: `✓ shows pending then success
button disabled=true
status text: 保存中
saveCourse called once with course id`,
    },
    {
      title: '注入拒绝响应并断言可重试错误',
      language: 'Vue Test Utils',
      code: `import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import SavePanel from './SavePanel.vue'
import { saveCourse } from './api'

vi.mock('./api', () => ({ saveCourse: vi.fn() }))
it('restores controls and announces an error', async () => {
  vi.mocked(saveCourse).mockRejectedValue(new Error('HTTP 503'))
  const wrapper = mount(SavePanel)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('HTTP 503')
  expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
})`,
      output: `✓ restores controls and announces an error
role=alert text contains HTTP 503
button enabled again for retry
No unhandled rejection in test output`,
    },
    {
      title: '固定测试脚本并在干净环境重复执行',
      language: 'PowerShell',
      code: `pnpm exec vitest run --reporter=verbose
pnpm exec vue-tsc --noEmit
pnpm run test:unit -- --run
node --version
pnpm --version`,
      output: `Test Files 1 passed (1)
Tests 5 passed (5)
vue-tsc completed with no diagnostics
Node.js v24.18.1
10.x`,
    },
  ],
  [vueName(v1Stage, 'ref、reactive 与响应式边界')]: [
    {
      title: 'ref 整体替换后仍保持追踪',
      language: 'TypeScript',
      code: `import { effect, ref } from 'vue'

const profile = ref({ name: 'Ada', role: 'student' })
let renders = 0
effect(() => {
  renders += 1
  console.log(renders, profile.value.name, profile.value.role)
})
profile.value = { name: 'Lin', role: 'admin' }
profile.value.name = 'Lin Chen'`,
      output: `1 Ada student
2 Lin admin
3 Lin Chen admin
outer ref replacement remains observable`,
    },
    {
      title: 'reactive 返回稳定代理而非原对象',
      language: 'TypeScript',
      code: `import { isProxy, isReactive, reactive } from 'vue'

const raw = { count: 0, nested: { label: 'ready' } }
const state = reactive(raw)
console.log(isReactive(state), isProxy(state))
console.log(state === raw, state.nested === raw.nested)
state.nested.label = 'updated'
console.log(raw.nested.label)`,
      output: `true true
false false
updated
reactive nested object is proxied lazily`,
    },
    {
      title: '模板自动解包与嵌套 ref 的边界',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { reactive, ref } from 'vue'
const count = ref(2)
const form = reactive({ name: ref('Ada'), tags: [ref('vue')] })
</script>
<template>
  <p>count={{ count }}</p>
  <p>name={{ form.name }}</p>
  <p>tag={{ form.tags[0] }}</p>
</template>`,
      output: `count=2
name=Ada
tag=vue
Top-level refs auto-unwrap in template; arrays still unwrap by renderer`,
    },
    {
      title: '解构丢失响应性并改用 toRefs 修复',
      language: 'TypeScript',
      code: `import { effect, reactive, toRefs } from 'vue'

const form = reactive({ name: 'Ada', city: 'Shanghai' })
const { name } = form
const { city } = toRefs(form)
let log = ''
effect(() => {
  log = name + '/' + city.value
  console.log(log)
})
form.name = 'Lin'
form.city = 'Hangzhou'`,
      output: `Ada/Shanghai
Ada/Hangzhou
Plain destructured name stayed stale; toRefs city updated`,
    },
    {
      title: '为整体替换与局部聚合各写一个断言',
      language: 'Vitest',
      code: `import { effect, reactive, ref } from 'vue'
import { expect, it, vi } from 'vitest'

it('tracks ref replacement and reactive mutation', () => {
  const selected = ref({ id: 'a' })
  const filters = reactive({ status: 'open' })
  const spy = vi.fn()
  effect(() => spy(selected.value.id, filters.status))
  selected.value = { id: 'b' }
  filters.status = 'closed'
  expect(spy.mock.calls.at(-1)).toEqual(["b", "closed"])
})`,
      output: `✓ tracks ref replacement and reactive mutation
effect calls: 3
last value: ["b", "closed"]
No warning about non-reactive mutation`,
    },
  ],
  [vueName(v1Stage, '依赖读取和写入通知')]: [
    {
      title: '只订阅当前分支实际读取的属性',
      language: 'TypeScript',
      code: `import { effect, reactive } from 'vue'

const state = reactive({ mode: 'name', name: 'Ada', age: 36 })
let runs = 0
effect(() => {
  runs += 1
  console.log(runs, state.mode === 'name' ? state.name : state.age)
})
state.age = 37
console.log('runs after age', runs)
state.name = 'Lin'
console.log('runs after name', runs)`,
      output: `1 Ada
runs after age 1
2 Lin
runs after name 2`,
    },
    {
      title: '同步多次写入进入同一调度批次',
      language: 'TypeScript',
      code: `import { effect, nextTick, reactive } from 'vue'

const state = reactive({ count: 0 })
let effectRuns = 0
effect(() => {
  effectRuns += 1
  console.log('effect', effectRuns, state.count)
}, { scheduler: (job) => queueMicrotask(job) })

state.count = 1
state.count = 2
state.count = 3
console.log('sync count', state.count, 'runs', effectRuns)
await nextTick()
console.log('after microtask runs', effectRuns)`,
      output: `sync count 3 runs 1
effect 2 3
after microtask runs 2
three writes produced one scheduled effect`,
    },
    {
      title: '渲染读取与 watch 消费同一条依赖边',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref, watch } from 'vue'
const visible = ref(true)
const score = ref(0)
watch(score, (next, previous) => {
  console.info('[watch]', previous, '->', next, 'visible=', visible.value)
})
</script>
<template>
  <button @click="score += 1">
    <span v-if="visible">score {{ score }}</span>
  </button>
</template>`,
      output: `Initial render reads visible and score
Click -> [watch] 0 -> 1 visible=true
DOM button text becomes score 1
Changing visible did not trigger score watch`,
    },
    {
      title: '条件切换时清理旧分支依赖',
      language: 'TypeScript',
      code: `import { effect, reactive } from 'vue'

const state = reactive({ useName: true, name: 'Ada', age: 36 })
let runs = 0
effect(() => {
  runs += 1
  console.log(runs, state.useName ? state.name : state.age)
})
state.name = 'Lin'
state.useName = false
state.name = 'Grace'
console.log('runs after stale name', runs)
state.age = 37
console.log('runs after active age', runs)`,
      output: `1 Ada
2 Lin
3 36
runs after stale name 3
4 37
runs after active age 4`,
    },
    {
      title: '同值、删除和数组长度分别验证',
      language: 'TypeScript',
      code: `import { effect, reactive } from 'vue'

const state = reactive({ status: 'open', extra: true, list: [1, 2] })
let runs = 0
effect(() => {
  runs += 1
  console.log(runs, state.status, state.list.length, 'extra' in state)
})
state.status = 'open'
state.list.push(3)
delete state.extra
console.log('final runs', runs)`,
      output: `1 open 2 true
2 open 3 true
3 open 3 false
final runs 3
same-value write did not notify`,
    },
  ],
  [vueName(v1Stage, 'computed 缓存与纯派生状态')]: [
    {
      title: 'computed 首次读取计算，之后复用缓存',
      language: 'TypeScript',
      code: `import { computed, ref } from 'vue'

const price = ref(100)
let evaluations = 0
const total = computed(() => {
  evaluations += 1
  return price.value * 1.13
})
console.log(total.value, evaluations)
console.log(total.value, evaluations)
price.value = 200
console.log(total.value, evaluations)`,
      output: `113 1
113 1
226 2
second read reused cached value`,
    },
    {
      title: '依赖变化只把 computed 标记为脏',
      language: 'TypeScript',
      code: `import { computed, effect, ref } from 'vue'

const first = ref(1)
const second = computed(() => first.value * 2)
const summary = computed(() => second.value + 10)
let reads = 0
effect(() => {
  reads += 1
  console.log('summary', summary.value, 'reads', reads)
})
first.value = 3
console.log('before render', reads)
await Promise.resolve()
console.log('after render', reads)`,
      output: `summary 12 reads 1
before render 1
after render 2
computed invalidation is lazy and effect refresh is scheduled`,
    },
    {
      title: '纯派生函数不修改输入数组',
      language: 'TypeScript',
      code: `import { computed, ref } from 'vue'

const courses = ref([
  { title: 'Vue 基础', score: 88, published: true },
  { title: 'Vue 路由', score: 95, published: true },
  { title: '草稿', score: 60, published: false },
])
const ranked = computed(() =>
  courses.value
    .filter((course) => course.published)
    .toSorted((a, b) => b.score - a.score)
)
console.log(ranked.value.map((course) => course.title))
console.log(courses.value.map((course) => course.title))`,
      output: `[ "Vue 路由", "Vue 基础" ]
[ "Vue 基础", "Vue 路由", "草稿" ]
source array order unchanged by computed`,
    },
    {
      title: '可写 computed 只封装一个明确的状态来源',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed, ref } from 'vue'
const firstName = ref('Ada')
const lastName = ref('Lovelace')
const fullName = computed({
  get: () => firstName.value + ' ' + lastName.value,
  set: (value: string) => {
    const [first, ...rest] = value.trim().split(/\\s+/)
    firstName.value = first || ''
    lastName.value = rest.join(' ')
  },
})
</script>
<template><input v-model="fullName" aria-label="姓名" /></template>`,
      output: `Initial input value: Ada Lovelace
Type "Lin Chen" -> firstName=Lin lastName=Chen
Changing firstName updates input value
No duplicate fullName ref exists`,
    },
    {
      title: '分别验证缓存命中与正确性边界',
      language: 'Vitest',
      code: `import { computed, ref } from 'vue'
import { expect, it, vi } from 'vitest'

it('caches derived totals but invalidates on input', () => {
  const quantity = ref(2)
  const price = ref(50)
  const calculator = vi.fn(() => quantity.value * price.value)
  const total = computed(calculator)
  expect(total.value).toBe(100)
  expect(total.value).toBe(100)
  expect(calculator).toHaveBeenCalledTimes(1)
  quantity.value = 3
  expect(total.value).toBe(150)
  expect(calculator).toHaveBeenCalledTimes(2)
})`,
      output: `✓ caches derived totals but invalidates on input
calculator calls: 2
first cached read: 100
invalidated read: 150`,
    },
  ],
  [vueName(v1Stage, 'watch、watchEffect 与清理')]: [
    {
      title: '数组源同时观察 ref 与 getter',
      language: 'TypeScript',
      code: `import { ref, watch } from 'vue'

const keyword = ref('vue')
const page = ref(1)
const history: string[] = []
watch([keyword, page], ([nextKeyword, nextPage], [oldKeyword, oldPage]) => {
  history.push(nextKeyword + ':' + nextPage)
  console.log(oldKeyword + ':' + oldPage, '->', nextKeyword + ':' + nextPage)
}, { immediate: true })
keyword.value = 'vite'
page.value = 2`,
      output: `undefined:undefined -> vue:1
vue:1 -> vite:1
vite:1 -> vite:2
history length=3`,
    },
    {
      title: 'watchEffect 自动收集条件依赖',
      language: 'TypeScript',
      code: `import { reactive, watchEffect } from 'vue'

const filter = reactive({ mode: 'title', title: 'Vue', owner: 'Ada' })
let runs = 0
const stop = watchEffect(() => {
  runs += 1
  console.log(runs, filter.mode, filter.mode === 'title' ? filter.title : filter.owner)
})
filter.owner = 'Lin'
console.log('runs after unused owner', runs)
filter.mode = 'owner'
filter.owner = 'Grace'
stop()`,
      output: `1 title Vue
runs after unused owner 1
2 owner Lin
3 owner Grace
3 effect runs total`,
    },
    {
      title: 'post flush 在 DOM 更新后读取尺寸',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
const rows = ref(2)
const box = ref<HTMLElement>()
watch(rows, async () => {
  console.log('pre', box.value?.querySelectorAll('li').length)
  await nextTick()
  console.log('post', box.value?.querySelectorAll('li').length)
  console.log('height', box.value?.scrollHeight)
}, { flush: 'post' })
</script>
<template><ul ref="box"><li v-for="n in rows" :key="n">{{ n }}</li></ul></template>`,
      output: `pre 2
post 3
height 84
post watcher observed the committed DOM`,
    },
    {
      title: 'onCleanup 取消过期的搜索请求',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref, watch } from 'vue'
const keyword = ref('')
const result = ref<string[]>([])
watch(keyword, async (query, _old, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  if (!query) return
  const response = await fetch('/api/search?q=' + encodeURIComponent(query), {
    signal: controller.signal,
  })
  if (response.ok) result.value = await response.json()
})
</script>`,
      output: `Type v -> request q=v started
Type vu -> request q=v canceled
request q=vu completed with 200
AbortError ignored as expected`,
    },
    {
      title: '手动停止 watch 并在卸载时释放资源',
      language: 'TypeScript',
      code: `import { effectScope, nextTick, ref, watch } from 'vue'

const source = ref(0)
let calls = 0
const scope = effectScope()
scope.run(() => {
  const stop = watch(source, () => calls += 1)
  source.value = 1
  stop()
})
await nextTick()
source.value = 2
await nextTick()
console.log('calls after stop', calls)
scope.stop()`,
      output: `calls after stop 1
watch no longer runs after stop()
effect scope released its children
No component instance retained`,
    },
  ],
  [vueName(v1Stage, '状态批处理与 nextTick')]: [
    {
      title: '同步写入先进入队列，微任务中只渲染一次',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { nextTick, ref } from 'vue'
const count = ref(0)
const renders = ref(0)
async function update() {
  count.value += 1
  count.value += 1
  count.value += 1
  console.log('sync', count.value)
  await nextTick()
  renders.value += 1
  console.log('after nextTick DOM', document.querySelector('output')?.textContent)
}
</script>
<template><button @click="update">增加</button><output>{{ count }}</output></template>`,
      output: `sync 3
after nextTick DOM 3
one browser paint for three writes
button remains interactive`,
    },
    {
      title: '批量筛选减少重复请求',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { reactive, watch } from 'vue'
const filters = reactive({ status: 'open', owner: 'all', page: 1 })
let requests = 0
watch(filters, async () => {
  requests += 1
  const query = new URLSearchParams({
    status: filters.status,
    owner: filters.owner,
    page: String(filters.page),
  })
  await fetch('/api/orders?' + query)
  console.info('[orders] request', requests, query.toString())
})
function applyPreset() {
  filters.status = 'paid'
  filters.owner = 'team-a'
  filters.page = 1
}
</script>`,
      output: `applyPreset() completed synchronously
[orders] request 1 status=paid&owner=team-a&page=1
three filter writes produced one request
Network panel shows one /api/orders call`,
    },
    {
      title: 'nextTick 后读取已提交的 DOM',
      language: 'TypeScript',
      code: `import { createApp, nextTick, ref } from 'vue'

const host = document.createElement('div')
const visible = ref(false)
createApp({
  setup() {
    return { visible }
  },
  template: '<p v-if="visible">loaded</p>',
}).mount(host)
console.log('before', host.textContent)
visible.value = true
console.log('sync', host.textContent)
await nextTick()
console.log('after', host.textContent)`,
      output: `before
sync
after loaded
DOM text changed only after nextTick`,
    },
    {
      title: '更新后把焦点送回可操作控件',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { nextTick, ref } from 'vue'
const editing = ref(false)
const input = ref<HTMLInputElement>()
async function startEdit() {
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}
</script>
<template>
  <button v-if="!editing" @click="startEdit">编辑标题</button>
  <input v-else ref="input" aria-label="课程标题" value="Vue 3" />
</template>`,
      output: `Click 编辑标题
button removed, input inserted
document.activeElement aria-label=课程标题
selectionStart=0 selectionEnd=5`,
    },
    {
      title: '识别 watch 递归写入并限制更新',
      language: 'TypeScript',
      code: `import { nextTick, ref, watch } from 'vue'

const number = ref(0)
let runs = 0
watch(number, (value) => {
  runs += 1
  if (value < 3) number.value = value + 1
})
number.value = 1
await nextTick()
console.log('value', number.value, 'watch runs', runs)
console.warn('Use equality guards or user events instead of recursive writes')`,
      output: `value 3 watch runs 3
watch queue settled after three microtasks
recursive writes converged at explicit guard
warning recommends equality guard`,
    },
  ],
  [vueName(v1Stage, '响应式缺陷与竞态实验')]: [
    {
      title: '固定慢请求晚返回以复现覆盖',
      language: 'TypeScript',
      code: `type Result = { query: string; rows: string[] }
const delays: Record<string, number> = { vue: 300, vite: 20 }
async function search(query: string): Promise<Result> {
  await new Promise((resolve) => setTimeout(resolve, delays[query]))
  return { query, rows: [query + '-result'] }
}
let visible = 'empty'
search('vue').then((result) => { visible = result.query })
search('vite').then((result) => { visible = result.query })
await new Promise((resolve) => setTimeout(resolve, 400))
console.log('final visible', visible)`,
      output: `request vue started at 0ms
request vite started at 0ms
vite completed at 20ms
vue completed at 300ms
final visible vue`,
    },
    {
      title: 'requestId 与 AbortController 双重防护',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
const keyword = ref('')
const rows = ref<string[]>([])
let requestId = 0
let controller: AbortController | undefined
async function search() {
  const id = ++requestId
  controller?.abort()
  controller = new AbortController()
  const response = await fetch('/api/search?q=' + encodeURIComponent(keyword.value), {
    signal: controller.signal,
  })
  const data = await response.json()
  if (id === requestId) rows.value = data
}
onBeforeUnmount(() => controller?.abort())
</script>`,
      output: `search vue id=1 starts
search vite id=2 starts; request 1 canceled
request 2 resolves and writes rows
late request 1 cannot overwrite result`,
    },
    {
      title: '用 onScopeDispose 移除重复事件订阅',
      language: 'TypeScript',
      code: `import { effectScope, onScopeDispose, ref, watch } from 'vue'

const width = ref(window.innerWidth)
const scope = effectScope()
scope.run(() => {
  const onResize = () => { width.value = window.innerWidth }
  window.addEventListener('resize', onResize, { passive: true })
  onScopeDispose(() => window.removeEventListener('resize', onResize))
  watch(width, (value) => console.info('[width]', value))
})
scope.stop()
console.log('active resize listeners after scope stop: 0')`,
      output: `[width] 1280
active resize listeners after scope stop: 0
scope stopped cleanly
No duplicate listener on remount`,
    },
    {
      title: '卸载后取消请求并拒绝写入旧实例',
      language: 'Vue Test Utils',
      code: `import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import CoursePanel from './CoursePanel.vue'
import { loadCourse } from './api'

vi.mock('./api', () => ({ loadCourse: vi.fn() }))
it('does not update after unmount', async () => {
  let resolve!: (value: unknown) => void
  vi.mocked(loadCourse).mockReturnValue(new Promise((done) => { resolve = done }))
  const wrapper = mount(CoursePanel, { props: { id: 'vue-1' } })
  wrapper.unmount()
  resolve({ title: 'late response' })
  await flushPromises()
  expect(wrapper.html()).toBe('')
})`,
      output: `✓ does not update after unmount
loadCourse called once with vue-1
late Promise resolved after unmount
No Vue instance mutation warning`,
    },
    {
      title: '用 Playwright 固定请求顺序回归竞态',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('new search result wins over delayed old request', async ({ page }) => {
  await page.route('**/api/search?q=vue', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    await route.fulfill({ json: [{ title: 'old Vue result' }] })
  })
  await page.goto('/courses')
  await page.getByLabel('搜索课程').fill('vue')
  await page.getByLabel('搜索课程').fill('vite')
  await expect(page.getByText('vite result')).toBeVisible()
  await page.waitForTimeout(400)
  await expect(page.getByText('vite result')).toBeVisible()
})`,
      output: `1 passed
fixture: vue response delayed 300ms
final row text: vite result
old Vue result never became visible`,
    },
  ],
  [vueName(v2Stage, 'props、emit 与组件输入输出')]: [
    {
      title: 'defineProps 只读输入并渲染金额',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
const props = defineProps<{
  amount: number
  currency?: 'CNY' | 'USD'
}>()
const format = (value: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: props.currency ?? 'CNY',
  }).format(value)
</script>
<template><output>{{ format(amount) }}</output></template>`,
      output: `amount=128.5 -> ¥128.50
amount=20 currency=USD -> US$20.00
Attempting props.amount=1 shows read-only warning
Parent value remains unchanged`,
    },
    {
      title: 'withDefaults 为对象 prop 创建独立默认值',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
interface Option { value: string; label: string }
const props = withDefaults(defineProps<{
  options?: Option[]
  placeholder?: string
}>(), {
  options: () => [{ value: '', label: '全部' }],
  placeholder: '请选择',
})
console.log(props.options.length, props.placeholder)
</script>
<template><select><option v-for="item in options" :key="item.value">{{ item.label }}</option></select></template>`,
      output: `1 请选择
Two component instances receive different option arrays
Missing options prop renders 全部
No shared mutable default warning`,
    },
    {
      title: 'defineEmits 报告完整事件载荷',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
const model = defineModel<string>({ required: true })
const emit = defineEmits<{
  submit: [payload: { query: string; page: number }]
  cancel: []
}>()
const query = model
function submit() {
  emit('submit', { query: query.value.trim(), page: 1 })
}
</script>
<template>
  <input v-model="query" aria-label="关键词" />
  <button type="button" @click="submit">搜索</button>
</template>`,
      output: `Type " Vue " then click 搜索
update:modelValue " Vue "
submit { query: "Vue", page: 1 }
cancel not emitted`,
    },
    {
      title: '父组件拒绝非法 v-model 更新',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref } from 'vue'
import PriceInput from './PriceInput.vue'
const price = ref(100)
function updatePrice(next: number) {
  if (!Number.isFinite(next) || next < 0) return
  price.value = next
}
</script>
<template>
  <PriceInput :model-value="price" @update:model-value="updatePrice" />
  <output>{{ price.toFixed(2) }}</output>
</template>`,
      output: `Enter 120 -> output 120.00
Enter -1 -> parent keeps 120.00
Child emits -1 but value is rejected
No prop mutation warning appears`,
    },
    {
      title: '分别测试 props 渲染与 emit 载荷',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import SearchField from './SearchField.vue'

it('renders props and emits a trimmed object', async () => {
  const wrapper = mount(SearchField, { props: { modelValue: 'Vue' } })
  expect(wrapper.get('input').element.value).toBe('Vue')
  await wrapper.get('input').setValue('  Router  ')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('submit')).toEqual([[{ query: 'Router', page: 1 }]])
})`,
      output: `✓ renders props and emits a trimmed object
input initial value: Vue
submit payload: { query: Router, page: 1 }
emitted count: 1`,
    },
  ],
  [vueName(v2Stage, '插槽、作用域插槽与组合')]: [
    {
      title: '默认插槽与具名插槽组成面板',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
defineProps<{ title: string }>()
</script>
<template>
  <section class="panel">
    <header>
      <slot name="header"><h2>{{ title }}</h2></slot>
    </header>
    <main><slot /></main>
    <footer><slot name="footer" /></footer>
  </section>
</template>`,
      output: `Panel receives header slot: 课程列表
Default slot renders three course cards
Footer slot renders 查看全部 button
No wrapper card inserted inside panel`,
    },
    {
      title: '作用域插槽向父级暴露行数据',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
defineProps<{ rows: Array<{ id: string; title: string; score: number }> }>()
</script>
<template>
  <ul>
    <li v-for="(row, index) in rows" :key="row.id">
      <slot name="row" :row="row" :index="index">
        {{ row.title }}
      </slot>
    </li>
  </ul>
</template>

<!-- Parent -->
<CourseList :rows="rows">
  <template #row="{ row, index }">
    <strong>{{ index + 1 }}. {{ row.title }}</strong>
    <span>{{ row.score }}</span>
  </template>
</CourseList>`,
      output: `Row 0 receives index=0 score=88
Row 1 receives index=1 score=95
Parent renders custom strong and span
Child never reads parent-level course label`,
    },
    {
      title: '插槽回退内容与显式空状态互斥',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
const props = defineProps<{
  loading: boolean
  items: unknown[]
}>()
</script>
<template>
  <div v-if="loading">加载中</div>
  <slot v-else-if="!items.length" name="empty">
    <p>暂无数据</p>
  </slot>
  <slot v-else />
</template>`,
      output: `loading=true -> 加载中 only
items=[] -> fallback 暂无数据
parent empty slot -> 自定义空状态 only
items populated -> default slot content`,
    },
    {
      title: '通过具名插槽显式转发布局区域',
      language: 'Vue SFC',
      code: `<template>
  <AppFrame>
    <template #sidebar="{ compact }">
      <slot name="sidebar" :compact="compact" />
    </template>
    <template #content><slot /></template>
  </AppFrame>
</template>
<script setup lang="ts">
defineSlots<{
  default?: () => unknown
  sidebar?: (props: { compact: boolean }) => unknown
}>()
</script>`,
      output: `AppFrame sidebar compact=true
Page sidebar receives compact=true
Default content forwarded unchanged
DevTools slots list only sidebar/default`,
    },
    {
      title: '作用域插槽内容保持地标和可访问名称',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('scoped cards keep keyboard and landmarks', async ({ page }) => {
  await page.goto('/components/list')
  await expect(page.getByRole('main')).toHaveCount(1)
  const link = page.getByRole('link', { name: 'Vue Router 课程' })
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/courses\\/vue-router/)
})`,
      output: `1 passed
main landmark count=1
focused link name: Vue Router 课程
URL after Enter: /courses/vue-router`,
    },
  ],
  [vueName(v2Stage, 'provide/inject 与依赖边界')]: [
    {
      title: '用 Symbol key 提供主题上下文',
      language: 'TypeScript',
      code: `import { inject, provide, readonly, ref, type InjectionKey } from 'vue'

type Theme = { mode: 'light' | 'dark'; toggle: () => void }
export const themeKey: InjectionKey<Theme> = Symbol('course-theme')
export function provideTheme() {
  const mode = ref<'light' | 'dark'>('light')
  provide(themeKey, {
    mode: readonly(mode),
    toggle: () => { mode.value = mode.value === 'light' ? 'dark' : 'light' },
  })
}
export function useTheme() {
  const theme = inject(themeKey)
  if (!theme) throw new Error('ThemeProvider is required')
  return theme
}`,
      output: `ThemeProvider supplies Symbol(course-theme)
Deep Button injects mode=light
toggle() changes mode to dark
Missing provider throws ThemeProvider is required`,
    },
    {
      title: '只读状态配合受控 action',
      language: 'TypeScript',
      code: `import { inject, provide, readonly, ref, type InjectionKey } from 'vue'

type FieldContext = {
  errors: Readonly<Record<string, string>>
  setError(field: string, message: string): void
}
const key: InjectionKey<FieldContext> = Symbol('field-context')
const errors = ref<Record<string, string>>({})
provide(key, {
  errors: readonly(errors),
  setError(field, message) {
    errors.value = { ...errors.value, [field]: message }
  },
})
const context = inject(key)!`,
      output: `context.setError('email', '邮箱格式错误')
errors.email becomes 邮箱格式错误
context.errors is readonly
Direct field assignment fails in development`,
    },
    {
      title: '必需依赖缺失时快速失败',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { inject, type InjectionKey } from 'vue'
interface FormContext { prefix: string }
const formKey: InjectionKey<FormContext> = Symbol('FormContext')
const raw = inject(formKey, null)
if (!raw) {
  throw new Error('[Field] must be rendered inside <FormProvider>')
}
const form = raw
</script>
<template><label :for="form.prefix + '-email'">邮箱</label></template>`,
      output: `Field inside provider: prefix=account
Field without provider: Uncaught Error
[Field] must be rendered inside <FormProvider>
No silent undefined prefix is rendered`,
    },
    {
      title: '嵌套 provider 使用最近祖先作用域',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import FormProvider from './FormProvider.vue'
import Field from './Field.vue'

it('isolates side-by-side forms', () => {
  const wrapper = mount({
    components: { FormProvider, Field },
    template: '<div><FormProvider prefix="a"><Field /></FormProvider><FormProvider prefix="b"><Field /></FormProvider></div>',
  })
  expect(wrapper.findAll('input').map((node) => node.attributes('id'))).toEqual(['a-email', 'b-email'])
})`,
      output: `✓ isolates side-by-side forms
input ids: a-email, b-email
Each Field reads nearest provider
No module-level form state shared`,
    },
    {
      title: '按生命周期选择 inject 或 Pinia',
      language: 'TypeScript',
      code: `import { defineStore } from 'pinia'
import { inject, provide, type InjectionKey } from 'vue'

export const sessionStore = defineStore('session', {
  state: () => ({ userId: '', role: 'guest' }),
})
const wizardKey: InjectionKey<{ step: number }> = Symbol('wizard')
provide(wizardKey, { step: 2 })
const wizard = inject(wizardKey)!

console.log('session crosses routes:', sessionStore)
console.log('wizard owner is current page:', wizard.step)`,
      output: `session crosses routes: useSessionStore
wizard owner is current page: 2
Pinia used for app-wide session
Injection used for current checkout wizard`,
    },
  ],
  [vueName(v2Stage, 'v-model 与受控表单状态')]: [
    {
      title: '文本、复选框和选择框的原生绑定',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { reactive } from 'vue'
const form = reactive({
  name: 'Ada',
  enabled: true,
  level: 'intermediate',
})
</script>
<template>
  <input v-model.trim="form.name" aria-label="姓名" />
  <input v-model="form.enabled" type="checkbox" aria-label="启用" />
  <select v-model="form.level" aria-label="等级">
    <option value="basic">基础</option>
    <option value="intermediate">进阶</option>
  </select>
</template>`,
      output: `Initial name=Ada enabled=true level=intermediate
Type " Lin " and blur -> name=Lin
Uncheck checkbox -> enabled=false
Select basic -> level=basic`,
    },
    {
      title: '自定义输入显式连接 modelValue 与事件',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
function update(event: Event) {
  const input = event.target as HTMLInputElement
  emit('update:modelValue', input.value)
}
</script>
<template>
  <input :value="props.modelValue" @input="update" aria-label="搜索" />
</template>`,
      output: `Parent passes modelValue=vue
Type vite -> emit update:modelValue vite
Parent updates modelValue to vite
Input remains controlled by parent`,
    },
    {
      title: '草稿值与已保存快照分离',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { reactive, ref, toRaw } from 'vue'
interface Profile { name: string; email: string }
const saved = ref<Profile>({ name: 'Ada', email: 'ada@example.test' })
const draft = reactive({ ...saved.value })
async function save() {
  await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  })
  saved.value = structuredClone(toRaw(draft))
}
</script>`,
      output: `Edit draft name to Lin
saved still contains Ada before response
PUT body contains Lin
After 200 saved becomes Lin`,
    },
    {
      title: '字段错误通过 aria-describedby 关联',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed, reactive } from 'vue'
const form = reactive({ email: 'bad' })
const errors = computed(() => ({
  email: form.email.includes('@') ? '' : '请输入有效邮箱',
}))
</script>
<template>
  <label for="email">邮箱</label>
  <input id="email" v-model="form.email" :aria-invalid="Boolean(errors.email)"
    :aria-describedby="errors.email ? 'email-error' : undefined" />
  <p v-if="errors.email" id="email-error" role="alert">{{ errors.email }}</p>
</template>`,
      output: `email=bad -> aria-invalid=true
aria-describedby=email-error
role=alert text=请输入有效邮箱
Valid email removes describedby and alert`,
    },
    {
      title: '按 label 定位并断言 v-model 更新',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ProfileForm from './ProfileForm.vue'

it('updates the model and exposes field errors', async () => {
  const wrapper = mount(ProfileForm)
  const email = wrapper.getByLabelText('邮箱')
  await email.setValue('invalid')
  expect(wrapper.get('[role="alert"]').text()).toContain('有效邮箱')
  await email.setValue('ada@example.test')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
    { email: 'ada@example.test' },
  ])
})`,
      output: `✓ updates the model and exposes field errors
invalid email shows role=alert
valid email emits one update:modelValue
emitted payload email=ada@example.test`,
    },
  ],
  [vueName(v2Stage, '异步提交、错误和取消')]: [
    {
      title: '用联合类型定义表单状态机',
      language: 'TypeScript',
      code: `type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting'; requestId: string }
  | { kind: 'success'; savedAt: string }
  | { kind: 'error'; message: string; retryable: boolean }

export function canSubmit(state: FormState): boolean {
  return state.kind === 'idle' || (state.kind === 'error' && state.retryable)
}
console.log(canSubmit({ kind: 'idle' }))
console.log(canSubmit({ kind: 'submitting', requestId: 'r1' }))
console.log(canSubmit({ kind: 'error', message: '503', retryable: true }))`,
      output: `true
false
true
submitting state cannot be submitted twice`,
    },
    {
      title: '入口立即防重并保留用户输入快照',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { reactive, ref } from 'vue'
const form = reactive({ name: 'Ada', email: 'ada@example.test' })
const submitting = ref(false)
async function submit() {
  if (submitting.value) return
  submitting.value = true
  const snapshot = structuredClone(form)
  try {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
  } finally {
    submitting.value = false
  }
}
</script>`,
      output: `First click sets submitting=true
Second immediate click makes zero requests
Network shows one PUT /api/profile
Input values remain editable after request`,
    },
    {
      title: 'AbortSignal 同时覆盖超时与页面离开',
      language: 'TypeScript',
      code: `export async function saveWithTimeout(
  payload: unknown,
  parentSignal: AbortSignal,
  timeoutMs = 8000,
) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  parentSignal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
    parentSignal.removeEventListener('abort', abort)
  }
}`,
      output: `Normal request completes before 8000ms
Route leave aborts parent signal
Slow request aborts at timeout
finally clears timer and removeEventListener`,
    },
    {
      title: '错误分类后展示字段或全局恢复动作',
      language: 'TypeScript',
      code: `export type ApiError =
  | { kind: 'validation'; fields: Record<string, string> }
  | { kind: 'auth'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'retryable'; message: string; requestId?: string }

export function toApiError(status: number, body: Record<string, unknown>): ApiError {
  if (status === 400) return { kind: 'validation', fields: body.fields as Record<string, string> }
  if (status === 401 || status === 403) return { kind: 'auth', message: '请重新登录或申请权限' }
  if (status === 409) return { kind: 'conflict', message: '数据已被其他人修改' }
  return { kind: 'retryable', message: '服务暂时不可用', requestId: body.requestId as string }
}
console.log(toApiError(409, {}))`,
      output: `{ kind: "conflict", message: "数据已被其他人修改" }
400 maps field errors to inputs
401/403 shows auth recovery
5xx shows retry with requestId`,
    },
    {
      title: '卸载后 resolve 不再触碰组件实例',
      language: 'Vue Test Utils',
      code: `import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import RegisterForm from './RegisterForm.vue'
import { registerUser } from './api'

vi.mock('./api', () => ({ registerUser: vi.fn() }))
it('aborts pending work when unmounted', async () => {
  const controller = new AbortController()
  vi.mocked(registerUser).mockImplementation(() => new Promise(() => {}))
  const wrapper = mount(RegisterForm)
  await wrapper.get('button').trigger('click')
  wrapper.unmount()
  controller.abort()
  await flushPromises()
  expect(wrapper.html()).toBe('')
})`,
      output: `✓ aborts pending work when unmounted
registerUser called with AbortSignal
component unmounted before response
No state mutation after unmount`,
    },
  ],
  [vueName(v2Stage, '组件契约测试与可访问性')]: [
    {
      title: '先把组件契约转成测试清单',
      language: 'TypeScript',
      code: `export const filterPanelContract = {
  inputs: ['open', 'options', 'selected'],
  outputs: ['update:open', 'apply', 'reset'],
  slots: ['empty'],
  keyboard: ['Tab enters controls', 'Escape closes', 'Enter applies'],
  states: ['closed', 'open', 'loading', 'error'],
} as const

for (const [kind, values] of Object.entries(filterPanelContract)) {
  console.log(kind.padEnd(8), values.length)
}`,
      output: `inputs   3
outputs  3
slots    1
keyboard 3
states   4`,
    },
    {
      title: '按语义角色定位筛选控件',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import FilterPanel from './FilterPanel.vue'

it('exposes an accessible expand button', async () => {
  const wrapper = mount(FilterPanel, { props: { open: false } })
  const button = wrapper.getByRole('button', { name: '筛选条件' })
  expect(button.attributes('aria-expanded')).toBe('false')
  await button.trigger('click')
  expect(wrapper.emitted('update:open')).toEqual([[true]])
})`,
      output: `✓ exposes an accessible expand button
button name: 筛选条件
aria-expanded: false -> emits true
No data-testid required to find control`,
    },
    {
      title: '弹层键盘路径与焦点回收',
      language: 'Vue Test Utils',
      code: `import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import FilterDialog from './FilterDialog.vue'

it('closes with Escape and restores focus', async () => {
  const wrapper = mount(FilterDialog, { attachTo: document.body })
  const trigger = wrapper.getByRole('button', { name: '打开筛选' })
  await trigger.trigger('click')
  const dialog = wrapper.getByRole('dialog')
  await dialog.trigger('keydown', { key: 'Escape' })
  expect(wrapper.emitted('close')).toHaveLength(1)
  expect(document.activeElement).toBe(trigger.element)
  wrapper.unmount()
})`,
      output: `✓ closes with Escape and restores focus
dialog received Escape once
close emitted count=1
activeElement returned to 打开筛选`,
    },
    {
      title: '异步状态通过 aria-live 被读出来',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref } from 'vue'
const state = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
async function refresh() {
  state.value = 'loading'
  try {
    const response = await fetch('/api/orders')
    if (!response.ok) throw new Error('请求失败')
    state.value = 'success'
  } catch {
    state.value = 'error'
  }
}
</script>
<template>
  <button :disabled="state === 'loading'" @click="refresh">刷新</button>
  <p role="status" aria-live="polite">
    {{ state === 'loading' ? '加载中' : state === 'success' ? '已刷新' : state === 'error' ? '刷新失败，请重试' : '尚未刷新' }}
  </p>
</template>`,
      output: `Click -> button disabled, status 加载中
200 response -> status 已刷新
500 response -> status 刷新失败，请重试
Only changing status text is announced`,
    },
    {
      title: '390px 视口下检查焦点与横向溢出',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('contract card works at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/components/course-card')
  await page.getByRole('button', { name: '展开详情' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: '课程详情' })).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBe(390)
})`,
      output: `1 passed
view 390x844
detail region visible after Enter
scrollWidth=390 clientWidth=390`,
    },
  ],
  [vueName(v3Stage, '路由参数、查询参数和深链接')]: [
    {
      title: '路径参数表示订单身份',
      language: 'Vue Router',
      code: `import { createRouter, createWebHistory } from 'vue-router'
import OrderPage from './OrderPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/orders/:orderId', component: OrderPage, props: true },
  ],
})
await router.push('/orders/42')
console.log(router.currentRoute.value.params.orderId)
console.log(router.currentRoute.value.fullPath)`,
      output: `42
/orders/42
OrderPage receives prop orderId="42"
Refresh on /orders/42 resolves the same record`,
    },
    {
      title: '筛选条件由 query 派生并写回 URL',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
const route = useRoute()
const router = useRouter()
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const status = computed(() => String(route.query.status || 'all'))
function setPage(next: number) {
  router.push({ query: { ...route.query, page: next } })
}
</script>
<template>
  <button @click="setPage(page + 1)">下一页 {{ page }}</button>
  <button @click="router.replace({ query: { status: 'paid' } })">已支付</button>
</template>`,
      output: `Initial URL /orders?page=2&status=all
Next -> /orders?page=3&status=all, history entry added
Paid -> /orders?status=paid, current entry replaced
Refresh keeps page and status`,
    },
    {
      title: '规范化非法深链接后 replace',
      language: 'TypeScript',
      code: `import type { LocationQuery } from 'vue-router'

const allowed = new Set(['all', 'open', 'paid'])
export function normalizeQuery(query: LocationQuery) {
  const rawPage = Number(Array.isArray(query.page) ? query.page[0] : query.page)
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const rawStatus = String(query.status ?? 'all')
  const status = allowed.has(rawStatus) ? rawStatus : 'all'
  return { page, status }
}
console.log(normalizeQuery({ page: '0', status: 'hacked' }))
console.log(normalizeQuery({ page: '3', status: 'paid' }))`,
      output: `{ page: 1, status: "all" }
{ page: 3, status: "paid" }
Router replace removes unknown status
Whitelisted query can be shared safely`,
    },
    {
      title: '路由滚动恢复等待异步列表渲染',
      language: 'Vue Router',
      code: `import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [],
  async scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      return { el: to.hash, top: 80, behavior: 'smooth' }
    }
    return { top: 0 }
  },
})`,
      output: `Back navigation restores savedPosition y=620
Hash /faq#billing scrolls billing to y=80
New page navigation returns top=0
Focus remains on routed main heading`,
    },
    {
      title: '同一组件复用也要响应路由参数',
      language: 'TypeScript',
      code: `import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadOrder } from './api'

const route = useRoute()
watch(
  () => route.params.orderId,
  async (id, _old, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    if (typeof id !== 'string') return
    const order = await loadOrder(id, controller.signal)
    console.info('[order]', id, order.status)
  },
  { immediate: true },
)`,
      output: `[order] 41 paid
Navigate to /orders/42 without remount
[order] 42 open
Request for order 41 canceled`,
    },
  ],
  [vueName(v3Stage, '导航守卫与权限边界')]: [
    {
      title: '全局守卫读取路由 meta 并返回落点',
      language: 'Vue Router',
      code: `import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({ history: createWebHistory(), routes: [] })
router.beforeEach((to) => {
  const needsAdmin = to.matched.some((record) => record.meta.requiresRole === 'admin')
  const role = sessionStorage.getItem('role')
  if (needsAdmin && role !== 'admin') {
    return { name: role ? 'forbidden' : 'login', query: { redirect: to.fullPath } }
  }
  return true
})
console.log('/admin blocked before component load')`,
      output: `guest -> /login?redirect=/admin
member -> /forbidden?redirect=/admin
admin -> navigation allowed
Component setup is not called for blocked route`,
    },
    {
      title: '会话恢复 Promise 去重后再判断权限',
      language: 'TypeScript',
      code: `import type { Router } from 'vue-router'
import { useSessionStore } from './session'

export function installSessionGuard(router: Router) {
  router.beforeEach(async (to) => {
    const session = useSessionStore()
    if (!session.restored) await session.restore()
    if (to.meta.public) return true
    if (!session.user) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    return true
  })
}
console.log('restore() called at most once per navigation burst')`,
      output: `restore() request started
three rapid navigations share one restore Promise
user restored with role=member
protected route navigation continues`,
    },
    {
      title: '认证失败与禁止访问分别处理',
      language: 'TypeScript',
      code: `import { router } from './router'

export async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init)
  if (response.status === 401) {
    await router.replace({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    throw new Error('AUTH_REQUIRED')
  }
  if (response.status === 403) {
    await router.replace({ name: 'forbidden' })
    throw new Error('PERMISSION_DENIED')
  }
  if (!response.ok) throw new Error('HTTP_' + response.status)
  return response
}`,
      output: `401 -> /login with current redirect
403 -> /forbidden, no login loop
500 -> request error, route unchanged
Message distinguishes auth from permission`,
    },
    {
      title: '重定向链增加终止标记',
      language: 'Vue Router',
      code: `router.beforeEach((to) => {
  if (to.meta.public) return true
  if (to.query.checking === '1') return true
  const roles = useSessionStore().roles
  const required = to.meta.requiresRole
  if (required && !roles.includes(required)) {
    return { name: 'forbidden', query: { from: to.fullPath, checking: '1' } }
  }
  return true
})
console.log('forbidden route is public and carries checking=1')`,
      output: `admin request redirected once to /forbidden
second guard pass sees checking=1
navigation settles on forbidden page
console shows no redirect loop warning`,
    },
    {
      title: 'API 层验证对象级权限',
      language: 'TypeScript',
      code: `export async function getOrder(orderId: string, userId: string) {
  const order = await db.orders.findUnique({ where: { id: orderId } })
  if (!order) throw Object.assign(new Error('NOT_FOUND'), { status: 404 })
  if (order.ownerId !== userId) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
  }
  return order
}

await getOrder('order-42', 'user-b').catch((error) => {
  console.log(error.status, error.message)
})`,
      output: `403 FORBIDDEN
Owner user-a receives order-42
User-b cannot bypass UI by calling API
Route guard result is not the only authorization check`,
    },
  ],
  [vueName(v3Stage, 'Pinia 模块、actions 与持久化')]: [
    {
      title: 'setup store 只保存客户端偏好',
      language: 'TypeScript',
      code: `import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useWorkspaceStore = defineStore('workspace', () => {
  const collapsed = ref(false)
  const recentFilters = ref<string[]>([])
  const isCompact = computed(() => collapsed.value && recentFilters.value.length > 0)
  function toggleSidebar() {
    collapsed.value = !collapsed.value
  }
  return { collapsed, recentFilters, isCompact, toggleSidebar }
})`,
      output: `workspace.collapsed=false
workspace.recentFilters=[]
toggleSidebar -> collapsed=true isCompact=false
Server order list is not stored in workspace`,
    },
    {
      title: 'action 统一校验并记录状态来源',
      language: 'TypeScript',
      code: `import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFilterStore = defineStore('filters', () => {
  const status = ref<'all' | 'open' | 'paid'>('all')
  const page = ref(1)
  function apply(next: { status: typeof status.value; page: number }) {
    status.value = next.status
    page.value = Math.max(1, Math.trunc(next.page))
    console.info('[filter.action] apply', status.value, page.value)
  }
  return { status, page, apply }
})`,
      output: `[filter.action] apply paid 1
[filter.action] apply open 4
page=-2 normalized to 1
Pinia devtools shows two apply actions`,
    },
    {
      title: '持久化白名单与命名空间版本',
      language: 'TypeScript',
      code: `import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

export const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

export const persistWorkspace = {
  key: 'learning.workspace.v2',
  storage: localStorage,
  pick: ['collapsed', 'recentFilters'],
  version: 2,
} as const
console.log(persistWorkspace.key, persistWorkspace.pick)`,
      output: `learning.workspace.v2 [ collapsed, recentFilters ]
loading/error/token keys are absent from storage
localStorage JSON version=2
Temporary form draft remains in memory`,
    },
    {
      title: '旧版本持久数据通过 migrate 转换',
      language: 'TypeScript',
      code: `type WorkspaceV2 = { collapsed: boolean; recentFilters: string[] }
export function migrateWorkspace(value: unknown): WorkspaceV2 {
  if (!value || typeof value !== 'object') return { collapsed: false, recentFilters: [] }
  const input = value as Record<string, unknown>
  return {
    collapsed: Boolean(input.collapsed ?? input.sidebarClosed),
    recentFilters: Array.isArray(input.recentFilters)
      ? input.recentFilters.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : [],
  }
}
console.log(migrateWorkspace({ sidebarClosed: true, recentFilters: ['paid', 7] }))`,
      output: `{ collapsed: true, recentFilters: [ "paid" ] }
unknown object falls back to safe defaults
legacy sidebarClosed field is accepted
recentFilters capped at eight strings`,
    },
    {
      title: '跨标签页同步与退出清理',
      language: 'TypeScript',
      code: `const store = useWorkspaceStore()
window.addEventListener('storage', (event) => {
  if (event.key !== 'learning.workspace.v2' || !event.newValue) return
  try {
    store.$patch(JSON.parse(event.newValue))
  } catch (error) {
    console.warn('[workspace] invalid storage payload', error)
  }
})
export async function logout() {
  store.$reset()
  localStorage.removeItem('learning.workspace.v2')
  sessionStorage.clear()
}`,
      output: `Tab A toggles sidebar collapsed=true
Tab B receives storage event and updates
invalid JSON logged without crashing
logout removes workspace and session keys`,
    },
  ],
  [vueName(v3Stage, '远程数据缓存和失效')]: [
    {
      title: 'queryKey 覆盖资源、筛选和分页',
      language: 'TypeScript',
      code: `export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: { status: string; page: number }) =>
    [...orderKeys.lists(), filters.status, filters.page] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
}

console.log(orderKeys.list({ status: 'paid', page: 2 }))
console.log(orderKeys.detail('order-42'))`,
      output: `[ "orders", "list", "paid", 2 ]
[ "orders", "detail", "order-42" ]
Different filters produce different keys
Mutation can invalidate the list prefix`,
    },
    {
      title: 'useQuery 把路由筛选变成缓存请求',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { fetchOrders } from './api'
const route = useRoute()
const status = computed(() => String(route.query.status || 'all'))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const query = useQuery({
  queryKey: computed(() => ['orders', 'list', status.value, page.value]),
  queryFn: () => fetchOrders({ status: status.value, page: page.value }),
})
</script>
<template><p v-if="query.isPending.value">加载中</p><p v-else>{{ query.data.value?.total }}</p></template>`,
      output: `cache key orders/list/all/1 -> pending
response total=18 -> success
change status=paid -> new cache key request
return to all/1 within staleTime -> instant cache`,
    },
    {
      title: 'staleTime 与 gcTime 分别配置',
      language: 'TypeScript',
      code: `import { QueryClient } from '@tanstack/vue-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
console.log('fresh 30s, garbage collect after 5m')`,
      output: `fresh 30s, garbage collect after 5m
refetch on focus starts only after stale
unobserved cache removed after gcTime
retry limited to one additional request`,
    },
    {
      title: 'mutation 精确失效列表与详情',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { saveOrder, type Order } from './api'
const client = useQueryClient()
const mutation = useMutation({
  mutationFn: (order: Order) => saveOrder(order),
  onSuccess: async (saved) => {
    client.setQueryData(['orders', 'detail', saved.id], saved)
    await client.invalidateQueries({ queryKey: ['orders', 'list'] })
  },
})
</script>
<template><button :disabled="mutation.isPending.value" @click="mutation.mutate({ id: '42', status: 'paid' })">保存</button></template>`,
      output: `PUT /api/orders/42 -> 200
detail cache updated with saved payload
list queries invalidated and refetched
unrelated products cache remains fresh`,
    },
    {
      title: '断网时保留缓存并标记数据过期',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { fetchDashboard } from './api'
const query = useQuery({
  queryKey: ['dashboard'],
  queryFn: fetchDashboard,
  networkMode: 'offlineFirst',
  staleTime: 60_000,
})
const notice = computed(() =>
  query.isError.value && query.data.value
    ? '网络不可用，显示缓存数据'
    : query.isError.value
      ? '网络不可用，请重试'
      : '',
)
</script>
<template><p v-if="notice" role="status">{{ notice }}</p><pre>{{ query.data.value }}</pre></template>`,
      output: `Go offline after dashboard loaded
query keeps cached data and enters error
role=status text=网络不可用，显示缓存数据
Reconnect triggers a fresh request`,
    },
  ],
  [vueName(v3Stage, '请求竞态、重试与错误恢复')]: [
    {
      title: '把 HTTP 错误映射成可恢复类型',
      language: 'TypeScript',
      code: `type ErrorKind = 'retryable' | 'auth' | 'validation' | 'missing'
export function classify(status: number): ErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 400 || status === 422) return 'validation'
  if (status === 404) return 'missing'
  if (status === 408 || status === 429 || status >= 500) return 'retryable'
  return 'retryable'
}
for (const status of [400, 401, 404, 429, 503]) {
  console.log(status, classify(status))
}`,
      output: `400 validation
401 auth
404 missing
429 retryable
503 retryable`,
    },
    {
      title: '指数退避同时限制次数与总时长',
      language: 'TypeScript',
      code: `export async function retry<T>(
  task: () => Promise<T>,
  { attempts = 3, baseMs = 200, deadlineMs = 3000 } = {},
) {
  const started = Date.now()
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (Date.now() - started > deadlineMs) break
    try {
      return await task()
    } catch (error) {
      lastError = error
      const jitter = Math.floor(Math.random() * 80)
      await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** attempt + jitter))
    }
  }
  throw lastError
}`,
      output: `attempt 1 fails immediately
attempt 2 waits about 200ms plus jitter
attempt 3 waits about 400ms plus jitter
deadline stops attempts after 3000ms`,
    },
    {
      title: '新资源请求取消旧请求',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadOrder } from './api'
const route = useRoute()
const order = ref<{ id: string }>()
let controller: AbortController | undefined
watch(() => route.params.orderId, async (id, _old, onCleanup) => {
  controller?.abort()
  controller = new AbortController()
  onCleanup(() => controller?.abort())
  if (typeof id !== 'string') return
  order.value = await loadOrder(id, controller.signal)
}, { immediate: true })
</script>`,
      output: `open order-1 request started
navigate order-2 -> order-1 canceled
order-2 response becomes visible
Network shows canceled request for order-1`,
    },
    {
      title: '查询缓存支持失败时保留旧数据',
      language: 'TypeScript',
      code: `import { QueryClient } from '@tanstack/vue-query'

export const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry(failureCount, error) {
        const status = (error as { status?: number }).status ?? 0
        return failureCount < 2 && (status === 429 || status >= 500)
      },
      retryDelay(attempt) {
        return Math.min(1000 * 2 ** attempt, 8000)
      },
    },
  },
})
console.log('retry delays: 2000ms then 4000ms')`,
      output: `retry delays: 2000ms then 4000ms
400 stops after first request
503 retries twice then shows error
existing cached data remains available`,
    },
    {
      title: '幂等键防止重试重复创建订单',
      language: 'TypeScript',
      code: `import { randomUUID } from 'node:crypto'

const idempotencyKey = randomUUID()
export async function createOrder(payload: { courseId: string }) {
  return fetch('/api/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  })
}
console.log('retry with same key', idempotencyKey)`,
      output: `retry with same key 5ad8f4b8-...
first request times out after server commit
second request returns the same order id
no duplicate order is created`,
    },
  ],
  [vueName(v3Stage, '多页面企业功能实验')]: [
    {
      title: '先画四种状态的真实来源',
      language: 'TypeScript',
      code: `export const stateOwnership = {
  url: ['page', 'status', 'orderId'],
  pinia: ['sidebarCollapsed', 'recentFilters'],
  queryCache: ['orders.list', 'orders.detail'],
  component: ['draftNote', 'searchFocus'],
} as const

for (const [owner, fields] of Object.entries(stateOwnership)) {
  console.table({ owner, fields: fields.join(', ') })
}`,
      output: `url            page, status, orderId
pinia          sidebarCollapsed, recentFilters
queryCache     orders.list, orders.detail
component      draftNote, searchFocus`,
    },
    {
      title: '列表路由参数直接驱动查询缓存',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { fetchOrders } from './api'
const route = useRoute()
const router = useRouter()
const filters = computed(() => ({
  status: String(route.query.status || 'all'),
  page: Math.max(1, Number(route.query.page) || 1),
}))
const orders = useQuery({
  queryKey: computed(() => ['orders', 'list', filters.value]),
  queryFn: () => fetchOrders(filters.value),
})
const goNext = () => router.push({ query: { ...route.query, page: filters.value.page + 1 } })
</script>
<template><button :disabled="orders.isFetching.value" @click="goNext">下一页</button></template>`,
      output: `initial cache key orders/list/{status:all,page:1}
click next -> URL page=2
new query key triggers one request
back button restores page=1 cache`,
    },
    {
      title: '详情 mutation 同时更新详情和列表',
      language: 'TypeScript',
      code: `import { useQueryClient } from '@tanstack/vue-query'
import { router } from './router'
import { saveOrder } from './api'

export function useSaveOrder() {
  const client = useQueryClient()
  return async (order: { id: string; status: string }) => {
    const saved = await saveOrder(order)
    client.setQueryData(['orders', 'detail', saved.id], saved)
    await client.invalidateQueries({ queryKey: ['orders', 'list'] })
    await router.push('/orders?status=paid')
  }
}
console.info('detail, list and navigation updated in one flow')`,
      output: `PUT /api/orders/42 -> 200
detail cache contains status=paid
orders/list queries refetch in background
navigation returns to filtered list`,
    },
    {
      title: '守卫和 API 都拒绝越权访问',
      language: 'TypeScript',
      code: `router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.ensureLoaded()
  if (to.meta.requiresRole && !session.roles.includes(String(to.meta.requiresRole))) {
    return { name: 'forbidden' }
  }
  return true
})

export async function deleteOrder(id: string) {
  const response = await fetch('/api/orders/' + id, { method: 'DELETE' })
  if (response.status === 403) throw new Error('ORDER_PERMISSION_DENIED')
  if (!response.ok) throw new Error('HTTP_' + response.status)
}`,
      output: `member opens /orders/42/edit -> forbidden
member sends DELETE API anyway -> 403
admin opens page and DELETE returns 204
no client-only authorization assumption`,
    },
    {
      title: '端到端验证筛选、编辑、返回和刷新',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('order flow keeps URL and cache coherent', async ({ page }) => {
  await page.goto('/orders?status=open&page=1')
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page).toHaveURL(/page=2/)
  await page.getByRole('link', { name: '订单 42' }).click()
  await page.getByRole('button', { name: '编辑' }).click()
  await page.getByLabel('状态').selectOption('paid')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page).toHaveURL(/status=paid/)
  await page.reload()
  await expect(page.getByText('订单 42')).toBeVisible()
})`,
      output: `1 passed
URL after next: /orders?status=open&page=2
save navigated to /orders?status=paid
reload preserved filtered order list`,
    },
  ],
  [vueName(v4Stage, '目录、别名、环境变量与 API 客户端')]: [
    {
      title: '按应用职责建立可检查目录',
      language: 'PowerShell',
      code: `New-Item -ItemType Directory -Force src/api,src/components,src/composables,src/features,src/router,src/stores | Out-Null
Get-ChildItem src -Directory | Select-Object Name
Get-ChildItem src/features -Directory | Select-Object Name`,
      output: `api
components
composables
features
router
stores
features: orders, courses, checkout`,
    },
    {
      title: 'Vite 与 tsconfig 别名保持一致',
      language: 'TypeScript',
      code: `// vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})

// tsconfig.app.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
console.log('vite and vue-tsc resolve @/api/client')`,
      output: `vite import @/api/client resolved
vue-tsc types for @/api/client resolved
production build emits no unresolved alias
Editor Go to Definition opens src/api/client.ts`,
    },
    {
      title: '扫描构建产物确认 VITE_ 值都是公开数据',
      language: 'PowerShell',
      code: `$env:VITE_API_BASE='https://api.example.test'
pnpm build
Get-ChildItem dist -Recurse -File |
  Select-String -Pattern 'api.example.test|SERVER_SECRET|VITE_' |
  Select-Object Path, LineNumber, Line
Write-Warning 'Any VITE_ value is shipped to the browser'`,
      output: `dist/assets/index-D8a1.js:1 api.example.test
No SERVER_SECRET match
Build contains only public API base
Terminal prints VITE values are browser-visible`,
    },
    {
      title: '类型化 API 客户端统一处理 JSON 与错误',
      language: 'TypeScript',
      code: `export class ApiError extends Error {
  constructor(public status: number, public requestId: string, message: string) {
    super(message)
  }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(import.meta.env.VITE_API_BASE + path, {
    ...init,
    headers: { accept: 'application/json', ...init.headers },
  })
  const requestId = response.headers.get('x-request-id') ?? 'unknown'
  if (!response.ok) throw new ApiError(response.status, requestId, 'API request failed')
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}`,
      output: `GET /orders -> 200 parsed JSON
GET /orders/404 -> ApiError status=404
x-request-id attached to thrown error
204 delete returns undefined without JSON parse`,
    },
    {
      title: '并发 401 只触发一次令牌刷新',
      language: 'TypeScript',
      code: `let refreshPromise: Promise<string> | null = null
export function refreshTokenOnce() {
  refreshPromise ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then((response) => {
      if (!response.ok) throw new Error('refresh failed')
      return response.json().then((body) => body.accessToken as string)
    })
    .finally(() => { refreshPromise = null })
  return refreshPromise
}
const [a, b, c] = await Promise.all([
  refreshTokenOnce(),
  refreshTokenOnce(),
  refreshTokenOnce(),
])
console.log(a === b && b === c)`,
      output: `true
POST /api/auth/refresh called once
three failed requests resume with same token
refreshPromise reset after completion`,
    },
  ],
  [vueName(v4Stage, 'vue-tsc、ESLint 与提交门禁')]: [
    {
      title: '先让 vue-tsc 捕获模板类型错误',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
interface Course { id: string; title: string; progress: number }
defineProps<{ course: Course }>()
</script>
<template>
  <h2>{{ course.title }}</h2>
  <progress :value="course.progress" max="100" />
  <span>{{ course.missingField }}</span>
</template>`,
      output: `src/CourseCard.vue:8:21 - error TS2339:
Property 'missingField' does not exist on type 'Course'.
Found 1 error. vue-tsc exits with code 1.`,
    },
    {
      title: 'Vue 项目的 ESLint flat config',
      language: 'JavaScript',
      code: `import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      'vue/multi-word-component-names': 'error',
      'vue/no-mutating-props': 'error',
    },
  },
]`,
      output: `eslint.config.js loaded
Vue recommended rules enabled
dist and coverage ignored
vue/no-mutating-props severity=error`,
    },
    {
      title: '脚本规则与模板规则同时检查',
      language: 'TypeScript',
      code: `const props = defineProps<{ status: 'open' | 'paid' }>()
const message = props.status === 'paid' ? '已支付' : '待支付'
console.log(message)

// bad.vue 中故意加入：
// <button @click="props.status = 'paid'">{{ message }}</button>
// eslint 应报告 vue/no-mutating-props，而不是只通过 tsc`,
      output: `已支付
bad.vue:3:19 error Unexpected mutation of "status" prop
vue/no-mutating-props rule triggered
script type-check also rejects read-only assignment`,
    },
    {
      title: 'package 门禁按快速到慢速排列',
      language: 'JSON',
      code: `{
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "typecheck": "vue-tsc --noEmit",
    "test:unit": "vitest run",
    "build": "vite build",
    "check": "pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build"
  }
}`,
      output: `lint passed in 2.1s
typecheck passed in 4.8s
vitest 18 tests passed
vite build completed successfully`,
    },
    {
      title: '故意失败验证门禁确实阻断',
      language: 'PowerShell',
      code: `Add-Content src/App.vue '<script setup lang="ts">const unused: number = "bad"</script>'
pnpm check
if ($LASTEXITCODE -eq 0) { throw 'quality gate did not fail' }
git checkout -- src/App.vue
pnpm check`,
      output: `vue-tsc error TS2322: Type string is not assignable to type number
pnpm check exits with code 1
restored source passes lint typecheck tests build
gate correctly blocks invalid code`,
    },
  ],
  [vueName(v4Stage, 'Vitest 单测与组件测试')]: [
    {
      title: '按风险拆分纯函数、组合函数和组件测试',
      language: 'TypeScript',
      code: `export const testLayers = [
  { layer: 'unit', target: 'formatMoney', cases: ['zero', 'rounding'] },
  { layer: 'composable', target: 'useOrderFilters', cases: ['bad page', 'query sync'] },
  { layer: 'component', target: 'CourseCard', cases: ['props', 'emit', 'keyboard'] },
  { layer: 'e2e', target: 'checkout', cases: ['login', 'save', 'reload'] },
]
for (const row of testLayers) console.log(row.layer, row.target, row.cases.length)`,
      output: `unit formatMoney 2
composable useOrderFilters 2
component CourseCard 3
e2e checkout 3`,
    },
    {
      title: '隔离浏览器全局与网络依赖',
      language: 'Vitest',
      code: `import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'course-1' }),
  }))
})
afterEach(() => vi.unstubAllGlobals())

it('loads a course through the mocked boundary', async () => {
  const course = await import('./api').then((api) => api.loadCourse('course-1'))
  expect(course.id).toBe('course-1')
  expect(fetch).toHaveBeenCalledOnce()
})`,
      output: `✓ loads a course through the mocked boundary
fetch called once
response id: course-1
browser globals restored after test`,
    },
    {
      title: 'fake timers 验证超时与重试间隔',
      language: 'Vitest',
      code: `import { expect, it, vi } from 'vitest'
import { retry } from './retry'

it('uses bounded retry delays', async () => {
  vi.useFakeTimers()
  const task = vi.fn()
    .mockRejectedValueOnce(new Error('503'))
    .mockResolvedValueOnce('ok')
  const result = retry(task, { attempts: 2, baseMs: 200 })
  await vi.advanceTimersByTimeAsync(199)
  expect(task).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toBe('ok')
  vi.useRealTimers()
})`,
      output: `✓ uses bounded retry delays
task calls before 200ms: 1
task calls after 200ms: 2
result resolved with ok`,
    },
    {
      title: '组件测试断言用户可见行为',
      language: 'Vue Test Utils',
      code: `import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import EnrollmentCard from './EnrollmentCard.vue'
import { enroll } from './api'

vi.mock('./api', () => ({ enroll: vi.fn().mockResolvedValue({ id: 'e1' }) }))
it('shows submitting and then success', async () => {
  const wrapper = mount(EnrollmentCard, { props: { courseId: 'vue-3' } })
  await wrapper.getByRole('button', { name: '报名' }).trigger('click')
  expect(wrapper.get('[role="status"]').text()).toBe('提交中')
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toBe('报名成功')
  expect(enroll).toHaveBeenCalledWith('vue-3')
})`,
      output: `✓ shows submitting and then success
status text before resolve: 提交中
status text after resolve: 报名成功
enroll called with vue-3`,
    },
    {
      title: '覆盖率报告暴露未测分支',
      language: 'PowerShell',
      code: `pnpm exec vitest run --coverage
Get-Content coverage/coverage-summary.json -Raw |
  Select-String 'branches'
pnpm exec vitest run src/composables/useOrderFilters.test.ts`,
      output: `File       Statements Branches Functions
Order.ts   91.2%      66.7%    83.3%
Uncovered branch: status === "refunded"
Targeted test file rerun passes 7 tests`,
    },
  ],
  [vueName(v4Stage, 'Playwright、键盘与移动流程')]: [
    {
      title: '固定浏览器、基址和失败证据',
      language: 'TypeScript',
      code: `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})`,
      output: `webServer ready at http://127.0.0.1:4173
trace saved only for failed tests
screenshots and video keep failure context
chromium project selected`,
    },
    {
      title: '语义选择器替代脆弱 CSS 路径',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('filters orders by label and role', async ({ page }) => {
  await page.goto('/orders')
  await page.getByLabel('订单状态').selectOption('paid')
  await page.getByRole('button', { name: '应用筛选' }).click()
  await expect(page.getByRole('row', { name: /订单 42/ })).toBeVisible()
  await expect(page.getByText('共 1 条')).toBeVisible()
})`,
      output: `1 passed
selected paid by label
button found by accessible name
row 订单 42 visible and count text updated`,
    },
    {
      title: '只用键盘完成登录与筛选',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('keyboard completes the protected route', async ({ page }) => {
  await page.goto('/orders')
  await expect(page).toHaveURL(/login/)
  await page.getByLabel('邮箱').focus()
  await page.keyboard.type('ada@example.test')
  await page.keyboard.press('Tab')
  await page.keyboard.type('correct horse battery staple')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '订单' })).toBeVisible()
  await expect(page.getByLabel('订单状态')).toBeFocused()
})`,
      output: `1 passed
login redirected back to /orders
Enter submitted the form
heading 订单 visible and status focused`,
    },
    {
      title: '390px 移动视口验证菜单和触摸目标',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
test('mobile menu remains usable', async ({ page }) => {
  await page.goto('/courses')
  await page.getByRole('button', { name: '打开课程目录' }).tap()
  const menu = page.getByRole('dialog', { name: '课程目录' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Vue 3' })).toHaveCSS('min-height', '44px')
  await menu.getByRole('link', { name: 'Vue 3' }).tap()
  await expect(page).toHaveURL(/vue3/)
})`,
      output: `1 passed
viewport 390x844 hasTouch=true
dialog 课程目录 visible
link min-height=44px and navigation succeeded`,
    },
    {
      title: '用 route 固定慢网和错误响应',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('shows retry after delayed 503', async ({ page }) => {
  await page.route('**/api/orders?status=paid', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.fulfill({ status: 503, json: { requestId: 'req-7' } })
  })
  await page.goto('/orders?status=paid')
  await expect(page.getByRole('status')).toHaveText('加载中')
  await expect(page.getByRole('alert')).toContainText('服务暂时不可用')
  await expect(page.getByRole('button', { name: '重试' })).toBeEnabled()
})`,
      output: `1 passed
request delayed 500ms
loading status observed before response
alert visible with retry button enabled`,
    },
  ],
  [vueName(v4Stage, '代码分割、缓存和 Web Vitals')]: [
    {
      title: '从构建图找出首屏必要 chunk',
      language: 'PowerShell',
      code: `pnpm build
Get-Content dist/index.html -Raw
Get-ChildItem dist/assets -File |
  Sort-Object Length -Descending |
  Select-Object -First 10 Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}}`,
      output: `entry index-B8f2.js 162.4 KB
CourseCatalog-C3d8.js 41.8 KB
Checkout-E2a1.js 88.6 KB
index HTML directly references only entry and CSS`,
    },
    {
      title: '内容哈希与入口缓存采用不同策略',
      language: 'TypeScript',
      code: `import express from 'express'
const app = express()
app.use('/assets', express.static('dist/assets', {
  immutable: true,
  maxAge: '1y',
}))
app.get('*', (_request, response) => {
  response.set('Cache-Control', 'no-cache')
  response.sendFile('dist/index.html', { root: process.cwd() })
})
app.listen(4173)`,
      output: `GET /assets/index-B8f2.js
Cache-Control: public, max-age=31536000, immutable
GET /orders/42
Cache-Control: no-cache and current index.html`,
    },
    {
      title: '为 LCP 主图增加预加载与尺寸',
      language: 'HTML',
      code: `<link rel="preload" as="image" href="/media/vue-course-hero.webp"
  fetchpriority="high" type="image/webp" />
<img src="/media/vue-course-hero.webp"
  width="1200" height="630" fetchpriority="high"
  alt="Vue 3 企业课程实战界面" />
<script type="module" src="/src/main.ts"></script>`,
      output: `LCP element: hero image
fetchpriority=high preload starts early
Rendered aspect ratio 1200x630
CLS contribution from image equals 0`,
    },
    {
      title: '把长任务移出输入响应路径',
      language: 'TypeScript',
      code: `export async function filterLargeCatalog(rows: string[], keyword: string) {
  const worker = new Worker(new URL('./catalog-filter.worker.ts', import.meta.url), {
    type: 'module',
  })
  return new Promise<string[]>((resolve, reject) => {
    worker.onmessage = (event) => { resolve(event.data); worker.terminate() }
    worker.onerror = (error) => { reject(error); worker.terminate() }
    worker.postMessage({ rows, keyword: keyword.trim().toLowerCase() })
  })
}
console.info('input remains responsive while filtering runs in worker')`,
      output: `keydown handler completes in 3ms
worker filters 50000 rows off main thread
INP candidate remains below 200ms
worker terminated after one result`,
    },
    {
      title: '用固定尺寸与骨架减少 CLS',
      language: 'CSS',
      code: `.course-card {
  display: grid;
  grid-template-rows: 180px minmax(96px, auto) 44px;
  min-height: 320px;
  contain: layout paint;
}
.course-card__media {
  width: 100%;
  height: 180px;
  object-fit: cover;
}
.course-card__skeleton { min-height: 96px; }`,
      output: `Card height before data: 320px
Card height after image and title: 320px
CLS contribution: 0.000
No layout shift from skeleton to content`,
    },
  ],
  [vueName(v4Stage, '错误监控与可访问性验收')]: [
    {
      title: '在应用级错误入口补充发布信息',
      language: 'TypeScript',
      code: `import { createApp } from 'vue'
import App from './App.vue'
import { reportError } from './observability'

const app = createApp(App)
app.config.errorHandler = (error, _instance, info) => {
  reportError({
    error,
    info,
    release: import.meta.env.VITE_RELEASE,
    route: location.pathname,
    requestId: sessionStorage.getItem('last-request-id'),
  })
}
app.config.warnHandler = (message, _instance, trace) => {
  if (import.meta.env.DEV) console.warn(message, trace)
}
app.mount('#app')`,
      output: `error handler installed before mount
release=2026.11.24 attached
route=/courses/vue3 attached
requestId linked when an API call occurred`,
    },
    {
      title: '构建 source map 并以 release 上传',
      language: 'PowerShell',
      code: `$env:VITE_RELEASE='vue3-2026.11.24'
pnpm vite build --sourcemap hidden
Get-ChildItem dist/assets/*.map | Select-Object Name, Length
pnpm exec sourcemap-upload dist/assets --release $env:VITE_RELEASE
Remove-Item dist/assets/*.map`,
      output: `index-B8f2.js.map 412.7 KB
uploaded 7 source maps for vue3-2026.11.24
hidden maps are not referenced by browser JS
local map files removed after upload`,
    },
    {
      title: 'onErrorCaptured 提供可恢复错误边界',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
const failed = ref(false)
const route = useRoute()
onErrorCaptured((error, _instance, info) => {
  console.error('[boundary]', info, error)
  reportError({ error, info, route: route.fullPath })
  failed.value = true
  return false
})
function retry() {
  failed.value = false
}
</script>
<template>
  <section v-if="failed" role="alert">
    <h2>此区域加载失败</h2>
    <button @click="retry">重试</button>
  </section>
  <slot v-else />
</template>`,
      output: `child setup throws TypeError
[boundary] setup function TypeError logged
role=alert visible with retry button
retry remounts only the failed section`,
    },
    {
      title: 'axe 自动扫描关键页面和弹层',
      language: 'Playwright',
      code: `import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('course page and dialog have no critical a11y violations', async ({ page }) => {
  await page.goto('/courses/vue3')
  const base = await new AxeBuilder({ page }).analyze()
  expect(base.violations.filter((item) => item.impact === 'critical')).toEqual([])
  await page.getByRole('button', { name: '打开筛选' }).click()
  const dialog = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  expect(dialog.violations).toEqual([])
})`,
      output: `1 passed
course page critical violations=0
dialog violations=0
axe scanned visible dialog subtree`,
    },
    {
      title: '人工键盘与屏幕阅读器验收记录',
      language: 'Markdown',
      code: `- [ ] 390px 下用 Tab 从页头走到课程操作区
- [ ] Enter 打开详情，Escape 返回并恢复焦点
- [ ] 表单错误由屏幕阅读器读出且不打断输入
- [ ] 200% 缩放后内容不重叠、不失控横向滚动
- [ ] 无动画偏好下关闭非必要动画
- [ ] 记录浏览器、屏幕阅读器版本和发现的问题`,
      output: `Keyboard pass: 14 focus stops, all visible
Escape restored focus to 打开筛选
NVDA announced error via email-error
200% zoom horizontal overflow=0`,
    },
  ],
  [vueName(v5Stage, 'SPA、SSG、SSR 与混合渲染')]: [
    {
      title: '把管理端配置成客户端 SPA',
      language: 'Nuxt Config',
      code: `export default defineNuxtConfig({
  routeRules: {
    '/admin/**': { ssr: false },
    '/': { ssr: true },
  },
  devtools: { enabled: true },
})

console.info('public pages render on server; admin shell hydrates on client')`,
      output: `GET / -> server-rendered HTML includes main heading
GET /admin/users -> SPA shell without admin content
Network then requests /_nuxt/admin chunk
Admin API still requires authentication`,
    },
    {
      title: '在构建期预渲染公开课程目录',
      language: 'Nuxt Config',
      code: `export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/courses/**': { prerender: true },
  },
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/courses/vue3'],
    },
  },
})
console.log('runtime data must be available at nuxt generate time')`,
      output: `Prerendering / and /courses/vue3
Generated .output/public/index.html
Generated .output/public/courses/vue3/index.html
Page served without a Node render request`,
    },
    {
      title: 'SSR 请求时读取服务端数据',
      language: 'Nuxt Page',
      code: `<script setup lang="ts">
const { data, error } = await useAsyncData('course-vue3', () =>
  $fetch('/api/courses/vue3')
)
if (error.value) {
  throw createError({ statusCode: 502, statusMessage: 'Course service unavailable' })
}
</script>
<template>
  <article v-if="data">
    <h1>{{ data.title }}</h1>
    <p>{{ data.description }}</p>
  </article>
</template>`,
      output: `GET /api/courses/vue3 runs during server render
Server HTML contains Vue 3 course heading
Payload includes useAsyncData key course-vue3
Client hydration reuses payload without duplicate fetch`,
    },
    {
      title: '混合路由规则区分静态与动态区域',
      language: 'Nuxt Config',
      code: `export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/docs/**': { swr: 300 },
    '/account/**': { ssr: false },
    '/api/**': { cors: true },
  },
})
console.log('page strategy is now visible in one route rule table')`,
      output: `/ static HTML
/docs/vue  cached at edge for 300 seconds
/account/profile client-only shell
/api/health CORS headers enabled`,
    },
    {
      title: '用响应头与 HTML 证据验证渲染模式',
      language: 'PowerShell',
      code: `$home = Invoke-WebRequest http://127.0.0.1:3000/
$admin = Invoke-WebRequest http://127.0.0.1:3000/admin
$home.Content | Select-String '<h1'
$admin.Content | Select-String 'id="__nuxt"'
$home.Headers['x-nitro-renderer']
$admin.Headers['x-nitro-renderer']`,
      output: `home HTML contains <h1>课程中心</h1>
admin HTML contains an empty Nuxt app shell
home renderer: node
admin renderer: client-only`,
    },
  ],
  [vueName(v5Stage, '服务端数据获取和请求状态隔离')]: [
    {
      title: '服务端请求转发 cookie 但只读取必要字段',
      language: 'Nuxt Server',
      code: `export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') ?? ''
  const user = await $fetch('/internal/session', {
    headers: cookie ? { cookie } : {},
  })
  if (!user?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return {
    id: user.id,
    displayName: user.displayName,
  }
})`,
      output: `GET /api/me with session cookie -> 200
response contains id and displayName only
GET without cookie -> 401 Unauthorized
token and full user object are not returned`,
    },
    {
      title: 'useAsyncData key 带课程 slug 防止串缓存',
      language: 'Nuxt Page',
      code: `<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data, refresh } = await useAsyncData(
  () => 'course-' + slug.value,
  () => $fetch('/api/courses/' + encodeURIComponent(slug.value)),
  { watch: [slug] },
)
</script>
<template>
  <h1>{{ data?.title }}</h1>
  <button @click="refresh">刷新课程</button>
</template>`,
      output: `payload key course-vue3
/api/courses/vue3 requested once
navigate to lesson-routing -> key course-lesson-routing
old course payload not reused for new slug`,
    },
    {
      title: 'lazy 数据与去重请求控制首屏',
      language: 'Nuxt Page',
      code: `<script setup lang="ts">
const { data: recommendations, status, execute } = await useLazyAsyncData(
  'recommendations',
  () => $fetch('/api/recommendations'),
  { server: false, dedupe: 'cancel' },
)
onMounted(() => execute())
</script>
<template>
  <p v-if="status === 'pending'">正在加载推荐</p>
  <ul v-else>
    <li v-for="item in recommendations" :key="item.id">{{ item.title }}</li>
  </ul>
</template>`,
      output: `SSR HTML omits recommendations request
Client mount executes one /api/recommendations call
status pending then success
rapid refresh cancels previous request`,
    },
    {
      title: '业务 404 与服务异常使用不同状态码',
      language: 'Nuxt Server',
      code: `export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing course id' })
  try {
    const course = await repository.findCourse(id)
    if (!course) throw createError({ statusCode: 404, statusMessage: 'Course not found' })
    return course
  } catch (error: unknown) {
    if ((error as { statusCode?: number }).statusCode === 404) throw error
    console.error('course lookup failed', { id, error })
    throw createError({ statusCode: 502, statusMessage: 'Course service unavailable' })
  }
})`,
      output: `unknown id -> 404 Course not found
valid id -> 200 course JSON
repository timeout -> 502 with server log
client receives no internal stack trace`,
    },
    {
      title: '用户态响应禁止共享缓存',
      language: 'Nuxt Server',
      code: `export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  setResponseHeader(event, 'vary', 'Cookie, Authorization')
  return {
    id: user.id,
    enrolledCourseIds: await listEnrollments(user.id),
  }
})
console.info('SSR payload and CDN response are user-specific')`,
      output: `response cache-control: private, no-store
response vary: Cookie, Authorization
anonymous request cannot read first user's payload
CDN does not store enrollment response`,
    },
  ],
  [vueName(v5Stage, 'hydration、客户端接管和错误')]: [
    {
      title: '服务端与客户端使用同一份确定性状态',
      language: 'Nuxt Page',
      code: `<script setup lang="ts">
const config = useRuntimeConfig()
const state = useState('page-meta', () => ({
  locale: config.public.locale,
  release: config.public.release,
}))
const { data } = await useAsyncData('home', () => $fetch('/api/home'))
</script>
<template>
  <main :data-locale="state.locale">
    <h1>{{ data?.title }}</h1>
    <p>release {{ state.release }}</p>
  </main>
</template>`,
      output: `SSR main data-locale=zh-CN
payload includes locale and release
client hydration produces no mismatch warning
DOM heading text unchanged after mount`,
    },
    {
      title: '把随机值延迟到客户端挂载后再写入',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { onMounted, ref } from 'vue'
const mounted = ref(false)
const clientNonce = ref('server-placeholder')
onMounted(() => {
  mounted.value = true
  clientNonce.value = crypto.randomUUID()
})
</script>
<template>
  <p>release: 2026.11.24</p>
  <p v-if="mounted">client nonce: {{ clientNonce }}</p>
</template>`,
      output: `SSR HTML contains release and no client nonce
client onMounted assigns UUID
hydration compares only deterministic markup
no Hydration node mismatch warning`,
    },
    {
      title: 'ClientOnly 只隔离浏览器专属地图',
      language: 'Nuxt Page',
      code: `<template>
  <article>
    <h1>配送路线</h1>
    <p>订单将在 18:30 前送达。</p>
    <ClientOnly>
      <LiveMap :site-id="siteId" />
      <template #fallback>
        <div class="map-placeholder" aria-label="地图加载中">
          地图加载中
        </div>
      </template>
    </ClientOnly>
  </article>
</template>`,
      output: `SSR HTML includes heading and delivery text
LiveMap component omitted on server
fallback reserves map dimensions
client hydrates LiveMap after mount`,
    },
    {
      title: '序列化 payload 前移除敏感字段',
      language: 'Nuxt Server',
      code: `export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const safePayload = {
    id: account.id,
    displayName: account.displayName,
    plan: account.plan,
    expiresAt: account.expiresAt.toISOString(),
  }
  if ('accessToken' in safePayload || 'passwordHash' in safePayload) {
    throw new Error('Sensitive field leaked into SSR payload')
  }
  return safePayload
})`,
      output: `payload keys: id, displayName, plan, expiresAt
HTML source contains no accessToken
JSON script contains no passwordHash
expiresAt serialized as ISO string`,
    },
    {
      title: 'hydration 警告进入监控并保留恢复路径',
      language: 'Nuxt Plugin',
      code: `export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:error', (error) => {
    reportError({
      type: 'hydration',
      message: error.message,
      route: useRoute().fullPath,
      release: useRuntimeConfig().public.release,
    })
  })
  nuxtApp.hook('vue:error', (error, instance, info) => {
    console.error('[vue:error]', info, instance?.$options.name, error)
  })
})`,
      output: `hydration mismatch hook captured once
report includes route /courses/vue3 and release
server page remains readable while client retries
operator can disable affected widget with runtime flag`,
    },
  ],
  [vueName(v5Stage, '缓存、CDN、Node 与边缘部署')]: [
    {
      title: '按响应共享范围设置缓存头',
      language: 'Nuxt Config',
      code: `export default defineNuxtConfig({
  routeRules: {
    '/courses/**': {
      headers: {
        'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=60',
      },
    },
    '/account/**': {
      headers: { 'cache-control': 'private, no-store' },
    },
  },
})
console.log('public catalog can share; account cannot')`,
      output: `/courses/vue3 cache-control includes s-maxage=300
/account/profile cache-control private, no-store
anonymous catalog request may be cached by CDN
authorized account response is never shared`,
    },
    {
      title: '内容哈希资源长缓存而 HTML 短缓存',
      language: 'Nuxt Config',
      code: `export default defineNuxtConfig({
  routeRules: {
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
    '/**': {
      headers: { 'cache-control': 'public, max-age=0, must-revalidate' },
    },
  },
})
console.log('build emits hashed /_nuxt assets')`,
      output: `/_nuxt/entry-D7a3.js immutable for one year
GET / revalidates index HTML
new deploy changes hashed asset URL
old HTML cannot silently receive incompatible new entry`,
    },
    {
      title: '把边缘限制写进运行配置',
      language: 'TypeScript',
      code: `type Runtime = 'node' | 'edge'
export function chooseRuntime(route: { timeoutMs: number; usesDatabase: boolean }): Runtime {
  if (route.usesDatabase) return 'node'
  if (route.timeoutMs > 20_000) return 'node'
  return 'edge'
}
console.log(chooseRuntime({ timeoutMs: 2_000, usesDatabase: false }))
console.log(chooseRuntime({ timeoutMs: 2_000, usesDatabase: true }))
console.log(chooseRuntime({ timeoutMs: 25_000, usesDatabase: false }))`,
      output: `edge
node
node
database and long-running routes stay on Node`,
    },
    {
      title: 'Node 制品启动与优雅停机',
      language: 'PowerShell',
      code: `pnpm build
$env:NITRO_PORT='3000'
$env:NITRO_HOST='127.0.0.1'
node .output/server/index.mjs
# 另一个终端验证后向进程发送 Ctrl+C
Invoke-WebRequest http://127.0.0.1:3000/api/health/ready`,
      output: `Nuxt production build complete
Nitro server listening on 127.0.0.1:3000
GET /api/health/ready -> 200
SIGINT starts graceful shutdown and exits`,
    },
    {
      title: '发布后按路径清理 CDN',
      language: 'PowerShell',
      code: `$release = 'vue3-2026.11.24'
$paths = @('/','/courses/vue3','/courses')
foreach ($path in $paths) {
  Invoke-RestMethod -Method Post -Uri 'https://cdn.example.test/purge' -Headers @{ Authorization = "Bearer $env:CDN_TOKEN" } -ContentType 'application/json' -Body (@{ paths = @($path); release = $release } | ConvertTo-Json)
}
Invoke-WebRequest https://www.example.test/ -Headers @{ 'Cache-Control'='no-cache' }`,
      output: `purged 3 paths for vue3-2026.11.24
CDN purge API returned 202 for each path
next anonymous GET fetches new index HTML
asset hashes from previous release remain readable`,
    },
  ],
  [vueName(v5Stage, '健康检查、日志和错误监控')]: [
    {
      title: '分别实现 liveness、readiness 和 startup',
      language: 'Nuxt Server',
      code: `// server/api/health/live.get.ts
export default defineEventHandler(() => ({ status: 'ok' }))

// server/api/health/ready.get.ts
export default defineEventHandler(async () => {
  const database = await checkDatabase(500)
  const cache = await checkCache(100)
  const ready = database && cache
  setResponseStatus(event, ready ? 200 : 503)
  return { ready, database, cache }
})

console.info('startup checks can reuse readiness without restarting the process')`,
      output: `GET /api/health/live -> 200 status ok
GET /api/health/ready -> 200 ready true
cache timeout -> 503 ready false
liveness remains 200 while dependency recovers`,
    },
    {
      title: '中间件输出结构化 requestId 日志',
      language: 'Nuxt Server',
      code: `export default defineEventHandler((event) => {
  const requestId = getRequestHeader(event, 'x-request-id') ?? crypto.randomUUID()
  event.context.requestId = requestId
  const started = performance.now()
  event.node.res.setHeader('x-request-id', requestId)
  event.node.res.on('finish', () => {
    console.info(JSON.stringify({
      event: 'request.complete',
      requestId,
      path: event.path,
      status: event.node.res.statusCode,
      durationMs: Math.round(performance.now() - started),
      release: useRuntimeConfig().public.release,
    }))
  })
})`,
      output: `{"event":"request.complete","requestId":"5e...","path":"/courses/vue3","status":200,"durationMs":42,"release":"2026.11.24"}
response header x-request-id=5e...
no cookie or email appears in log
frontend error can reference same requestId`,
    },
    {
      title: '服务端异常统一记录并返回 requestId',
      language: 'Nuxt Server',
      code: `export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
    const requestId = context.event?.context.requestId ?? 'unknown'
    console.error(JSON.stringify({
      event: 'server.error',
      requestId,
      path: context.event?.path,
      message: error.message,
      stack: error.stack,
      release: useRuntimeConfig().public.release,
    }))
  })
})`,
      output: `server.error log includes requestId=5e...
status 500 response body includes requestId
stack stays in server log, not public payload
alert groups by release and route`,
    },
    {
      title: '采集 SSR 延迟与事件循环指标',
      language: 'TypeScript',
      code: `import { monitorEventLoopDelay } from 'node:perf_hooks'

const histogram = monitorEventLoopDelay({ resolution: 20 })
histogram.enable()
export function metricsSnapshot() {
  return {
    eventLoopP50Ms: histogram.percentile(50) / 1e6,
    eventLoopP99Ms: histogram.percentile(99) / 1e6,
    heapUsedMb: process.memoryUsage().heapUsed / 1024 / 1024,
    uptimeSeconds: process.uptime(),
  }
}
console.table(metricsSnapshot())`,
      output: `eventLoopP50Ms 4.8
eventLoopP99Ms 38.1
heapUsedMb 146.3
uptimeSeconds 1820`,
    },
    {
      title: '按运行手册演练依赖故障',
      language: 'PowerShell',
      code: `$env:FORCE_DATABASE_TIMEOUT='1'
Invoke-WebRequest http://127.0.0.1:3000/api/health/ready -SkipHttpErrorCheck
Get-Content logs/runtime.log -Tail 20
$env:FORCE_DATABASE_TIMEOUT='0'
Start-Sleep -Seconds 5
Invoke-WebRequest http://127.0.0.1:3000/api/health/ready -SkipHttpErrorCheck`,
      output: `ready first response: 503
log contains dependency=database timeout
alert triggered for readiness failure
after recovery ready response: 200`,
    },
  ],
  [vueName(v5Stage, 'Nuxt 发布与回滚实验')]: [
    {
      title: '构建不可变 release 目录与校验摘要',
      language: 'PowerShell',
      code: `$release = "vue3-$(Get-Date -Format yyyyMMddHHmmss)"
pnpm build
New-Item -ItemType Directory -Force "releases/$release" | Out-Null
Copy-Item .output/* "releases/$release" -Recurse
Get-FileHash "releases/$release/server/index.mjs" -Algorithm SHA256 |
  Select-Object Hash
Set-Content "releases/$release/release.json" (@{ id=$release; commit=(git rev-parse HEAD) } | ConvertTo-Json)`,
      output: `release id vue3-20261124183000
SHA256 copied into deployment record
server bundle stored under releases/<id>
commit and build artifact bound to release`,
    },
    {
      title: '按 1%、10%、50% 扩大流量',
      language: 'PowerShell',
      code: `$steps = @(1,10,50,100)
foreach ($percent in $steps) {
  ./deploy/set-weight.ps1 -Release $env:RELEASE_ID -Percent $percent
  Start-Sleep -Seconds 120
  $metrics = Invoke-RestMethod https://ops.example.test/api/releases/$env:RELEASE_ID
  if ($metrics.errorRate -gt 0.01 -or $metrics.p95Ms -gt 800) {
    ./deploy/set-weight.ps1 -Release $env:PREVIOUS_RELEASE -Percent 100
    throw "canary stopped at $percent percent"
  }
}`,
      output: `weight 1% health ok
weight 10% errorRate=0.003 p95Ms=412
weight 50% errorRate=0.004 p95Ms=438
weight 100% release promoted`,
    },
    {
      title: '用 expand-contract 保持回滚可读旧数据',
      language: 'SQL',
      code: `-- expand
ALTER TABLE courses ADD COLUMN delivery_mode TEXT;
UPDATE courses SET delivery_mode = 'self-paced' WHERE delivery_mode IS NULL;

-- application reads both delivery_mode and legacy live_mode
SELECT id, delivery_mode, live_mode FROM courses;

-- contract runs only after every instance uses delivery_mode
-- ALTER TABLE courses DROP COLUMN live_mode;`,
      output: `migration expand completed
old release still reads live_mode
new release writes delivery_mode
contract deferred until rollback window closes`,
    },
    {
      title: '切换版本时同时处理 HTML 与静态资源缓存',
      language: 'PowerShell',
      code: `./deploy/switch.ps1 -Release $env:RELEASE_ID
Invoke-RestMethod -Method Post https://cdn.example.test/purge -Headers @{ Authorization = "Bearer $env:CDN_TOKEN" } -Body (@{ paths = @('/','/courses/**') } | ConvertTo-Json)
Start-Sleep -Seconds 10
Invoke-WebRequest https://www.example.test/ -Headers @{ 'Cache-Control'='no-cache' } |
  Select-Object StatusCode`,
      output: `active symlink -> releases/vue3-20261124183000
purged index and course HTML paths
anonymous GET returned current release
previous hashed assets remained available`,
    },
    {
      title: '发布后从外部探测真实用户路径',
      language: 'Playwright',
      code: `import { expect, test } from '@playwright/test'

test('production smoke: home, login and course', async ({ page }) => {
  const response = await page.goto('https://www.example.test/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: '课程中心' })).toBeVisible()
  await page.getByRole('link', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible()
  await page.goto('https://www.example.test/courses/vue3')
  await expect(page.getByText('Hydration mismatch')).toHaveCount(0)
})`,
      output: `1 passed
home response status=200
login heading visible
course page contains no hydration error text`,
    },
  ],
  [vueName(v6Stage, '源码仓库、版本和阅读入口')]: [
    {
      title: '固定 Vue tag 与提交用于源码阅读',
      language: 'PowerShell',
      code: `git clone --depth 1 --branch v3.5.13 https://github.com/vuejs/core.git vue-core
Set-Location vue-core
git describe --tags --always
git rev-parse HEAD
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @vue/reactivity test`,
      output: `v3.5.13
0f2e...full commit hash
dependencies installed from frozen lockfile
@vue/reactivity tests pass`,
    },
    {
      title: '按职责定位 Vue 仓库包',
      language: 'PowerShell',
      code: `Get-ChildItem packages -Directory | Select-Object Name
rg -n "export function effect|function track|function trigger" packages/reactivity/src
rg -n "function mountElement|function patchElement" packages/runtime-core/src
rg -n "function baseCompile" packages/compiler-core/src`,
      output: `reactivity
runtime-core
runtime-dom
compiler-core
effect.ts: effect, track, trigger
renderer.ts: mountElement, patchElement
compiler.ts: baseCompile`,
    },
    {
      title: '把发布包导出映射回源码模块',
      language: 'PowerShell',
      code: `Get-Content packages/vue/package.json -Raw |
  ConvertFrom-Json |
  Select-Object -ExpandProperty exports
pnpm pack --pack-destination ../artifacts
Get-ChildItem ../artifacts
Select-String -Path dist/vue.runtime.esm-bundler.js -Pattern 'createApp' |
  Select-Object -First 3`,
      output: `exports: "." and "./package.json"
vue-3.5.13.tgz created
bundle symbol createApp resolves to runtime-dom
source module packages/runtime-dom/src/index.ts identified`,
    },
    {
      title: '在对应包写最小可运行实验',
      language: 'TypeScript',
      code: `import { effect, reactive } from '@vue/reactivity'
import { describe, expect, it } from 'vitest'

describe('exercise dependency cleanup', () => {
  it('stops tracking the old branch', () => {
    const state = reactive({ useA: true, a: 1, b: 2 })
    const seen: number[] = []
    effect(() => seen.push(state.useA ? state.a : state.b))
    state.a = 3
    state.useA = false
    state.a = 4
    expect(seen).toEqual([1, 3, 2])
  })
})`,
      output: `✓ exercise dependency cleanup
seen values: [1, 3, 2]
write a after branch switch did not rerun
test uses package source and local Vitest config`,
    },
    {
      title: '用符号引用与 blame 组成阅读证据',
      language: 'PowerShell',
      code: `rg -n "cleanupEffect|new ReactiveEffect|activeEffect" packages/reactivity/src/effect.ts
git blame -L 150,240 packages/reactivity/src/effect.ts
git log --oneline -- packages/reactivity/src/effect.ts | Select-Object -First 8
git show <commit>:packages/reactivity/src/effect.ts | Select-String cleanupEffect`,
      output: `effect.ts: cleanupEffect definition and call sites
blame identifies dependency cleanup changes
log lists recent reactive scheduler commits
historical source confirms behavior changed by version`,
    },
  ],
  [vueName(v6Stage, 'effect、track 与 trigger')]: [
    {
      title: '最小响应式副作用保存并恢复 activeEffect',
      language: 'TypeScript',
      code: `let activeEffect: (() => void) | undefined
function runEffect(fn: () => void) {
  const previous = activeEffect
  activeEffect = fn
  try {
    fn()
  } finally {
    activeEffect = previous
  }
}
const outer = () => console.log('outer')
const inner = () => console.log('inner', Boolean(activeEffect))
runEffect(outer)
runEffect(inner)
runEffect(outer)`,
      output: `outer
inner true
outer
activeEffect restored after nested effects`,
    },
    {
      title: '用 WeakMap 到 Set 复刻依赖索引',
      language: 'TypeScript',
      code: `const targetMap = new WeakMap<object, Map<PropertyKey, Set<() => void>>>()
function getDep(target: object, key: PropertyKey) {
  let depsMap = targetMap.get(target)
  if (!depsMap) targetMap.set(target, depsMap = new Map())
  let dep = depsMap.get(key)
  if (!dep) depsMap.set(key, dep = new Set())
  return dep
}
const target = { title: 'Vue' }
const dep = getDep(target, 'title')
dep.add(() => console.log('render title'))
for (const job of dep) job()
console.log('dep size', dep.size)`,
      output: `render title
dep size 1
same target/key returned the same Set
WeakMap allows target collection when unreachable`,
    },
    {
      title: 'track 只在读取时记录当前 effect',
      language: 'TypeScript',
      code: `type Effect = { run(): void }
const deps = new Map<string, Set<Effect>>()
let active: Effect | undefined
function track(key: string) {
  if (!active) return
  const dep = deps.get(key) ?? new Set<Effect>()
  dep.add(active)
  deps.set(key, dep)
}
function trigger(key: string) {
  for (const effect of deps.get(key) ?? []) effect.run()
}
const render: Effect = { run: () => { console.log('render'); track('title') } }
active = render
render.run()
active = undefined
trigger('title')
console.log('title dep', deps.get('title')?.size)`,
      output: `render
render
title dep 1
reading during render subscribed the effect`,
    },
    {
      title: 'trigger 复制依赖后交给 scheduler',
      language: 'TypeScript',
      code: `const jobs = new Set<() => void>()
let flushPromise: Promise<void> | null = null
function queueJob(job: () => void) {
  jobs.add(job)
  flushPromise ??= Promise.resolve().then(() => {
    flushPromise = null
    const snapshot = [...jobs]
    jobs.clear()
    for (const item of snapshot) item()
  })
}
const render = () => console.log('render once')
queueJob(render)
queueJob(render)
queueJob(() => console.log('watch job'))
await flushPromise`,
      output: `render once
watch job
duplicate render job removed by Set
snapshot protects queue while jobs execute`,
    },
    {
      title: '条件分支切换时移除旧依赖',
      language: 'TypeScript',
      code: `import { effect, reactive } from 'vue'
const state = reactive({ useTitle: true, title: 'Vue', count: 0 })
const seen: Array<string | number> = []
effect(() => {
  seen.push(state.useTitle ? state.title : state.count)
})
state.title = 'Vue 3'
state.useTitle = false
state.title = 'stale'
state.count = 1
console.log(seen)`,
      output: `[ "Vue", "Vue 3", 0, 1 ]
write title after branch switch was ignored
cleanup removed old title dependency
active count branch remained subscribed`,
    },
  ],
  [vueName(v6Stage, 'renderer 的 mount 与 patch')]: [
    {
      title: 'VNode 是描述，host API 才创建 DOM',
      language: 'TypeScript',
      code: `import { h, render } from 'vue'
const vnode = h('section', { class: 'course' }, [
  h('h1', 'Vue 3'),
  h('p', 'renderer experiment'),
])
const host = document.createElement('div')
render(vnode, host)
console.log(vnode.type, host.firstElementChild?.outerHTML)
render(null, host)
console.log('after unmount', host.innerHTML)`,
      output: `section <section class="course"><h1>Vue 3</h1><p>renderer experiment</p></section>
after unmount
render(null) removed the subtree from host`,
    },
    {
      title: '递归 mount 子节点并保留文本边界',
      language: 'TypeScript',
      code: `import { h, render } from 'vue'
const host = document.createElement('main')
render(
  h('article', { 'data-id': 'vue-3' }, [
    '入门',
    h('strong', null, '响应式'),
    ['数组', h('span', null, '嵌套')],
  ]),
  host,
)
console.log(host.querySelectorAll('*').length)
console.log(host.textContent)`,
      output: `3
入门响应式数组嵌套
article children include text, element and nested array
host contains exactly one article boundary`,
    },
    {
      title: 'patch 只更新变化的 class 和文本',
      language: 'TypeScript',
      code: `import { h, render } from 'vue'
const host = document.createElement('div')
const first = h('p', { class: 'tone-a' }, '草稿')
const second = h('p', { class: 'tone-b' }, '已发布')
render(first, host)
const paragraph = host.firstElementChild
render(second, host)
console.log(paragraph === host.firstElementChild)
console.log(host.firstElementChild?.outerHTML)`,
      output: `true
<p class="tone-b">已发布</p>
same p element reused by patch
class and text updated without remounting host`,
    },
    {
      title: 'keyed 列表让输入状态跟随业务实体',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref } from 'vue'
const rows = ref([
  { id: 'vue', title: 'Vue', draft: 'keep-vue' },
  { id: 'vite', title: 'Vite', draft: 'keep-vite' },
])
function moveFirst() {
  rows.value = [rows.value[1], rows.value[0]]
}
</script>
<template>
  <button @click="moveFirst">交换</button>
  <label v-for="row in rows" :key="row.id">
    {{ row.title }} <input v-model="row.draft" />
  </label>
</template>`,
      output: `Initial Vue draft=keep-vue
Initial Vite draft=keep-vite
Click 交换 -> DOM order changes
Each input value follows its business id`,
    },
    {
      title: '区分组件 patch 与错误 patchFlag',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { ref } from 'vue'
const title = ref('Vue')
const count = ref(0)
</script>
<template>
  <header>
    <h1>{{ title }}</h1>
    <button @click="count++">{{ count }}</button>
  </header>
</template>

<!-- Correct compiler output marks title/count as dynamic only. -->`,
      output: `Compiled vnode includes patchFlag for text
Static header tag is hoisted or plain stable markup
Click count updates button text only
Changing title updates h1 without replacing header`,
    },
  ],
  [vueName(v6Stage, 'scheduler 队列与批量更新')]: [
    {
      title: 'queueJob 用 Set 去掉同一组件重复任务',
      language: 'TypeScript',
      code: `const queue = new Set<() => void>()
let flushing = false
function queueJob(job: () => void) {
  queue.add(job)
  if (!flushing) {
    flushing = true
    Promise.resolve().then(() => {
      flushing = false
      const snapshot = [...queue]
      queue.clear()
      for (const item of snapshot) item()
    })
  }
}
const render = () => console.log('render')
queueJob(render)
queueJob(render)
await Promise.resolve()
console.log('queue size', queue.size)`,
      output: `render
queue size 0
same render function queued only once
flush executed in a microtask`,
    },
    {
      title: '同一同步调用栈的三次写入合并刷新',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { nextTick, ref } from 'vue'
const count = ref(0)
let renders = 0
async function update() {
  count.value = 1
  count.value = 2
  count.value = 3
  renders += 1
  console.log('sync', count.value, renders)
  await nextTick()
  console.log('dom', document.querySelector('output')?.textContent)
}
</script>
<template><button @click="update">更新</button><output>{{ count }}</output></template>`,
      output: `sync 3 1
dom 3
one scheduled render flush observed
not one DOM update per assignment`,
    },
    {
      title: 'nextTick 共享当前 flush Promise',
      language: 'TypeScript',
      code: `import { nextTick, ref } from 'vue'
const value = ref(0)
const order: string[] = []
value.value = 1
nextTick().then(() => order.push('first'))
nextTick().then(() => order.push('second'))
queueMicrotask(() => order.push('plain-microtask'))
await Promise.resolve()
await Promise.resolve()
console.log(order)`,
      output: `[ "plain-microtask", "first", "second" ]
both nextTick callbacks wait for current flush
callback order remains registration order
no separate timeout or interval is created`,
    },
    {
      title: 'pre watch、render、post watch 的阶段顺序',
      language: 'Vue SFC',
      code: `<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
const count = ref(0)
const logs: string[] = []
watch(count, () => logs.push('pre:' + count.value), { flush: 'pre' })
watch(count, () => logs.push('post:' + document.querySelector('output')?.textContent), { flush: 'post' })
function change() {
  logs.length = 0
  count.value = 1
  nextTick().then(() => console.log(logs))
}
</script>
<template><button @click="change">更新</button><output>{{ count }}</output></template>`,
      output: `[ "pre:1", "post:1" ]
pre watch ran before component DOM patch
post watch read the committed output
both jobs belonged to the same scheduler flush`,
    },
    {
      title: '递归更新达到上限并暴露循环根因',
      language: 'TypeScript',
      code: `import { effect, nextTick, ref, watch } from 'vue'
const value = ref(0)
let runs = 0
watch(value, (next) => {
  runs += 1
  if (runs < 5) value.value = next + 1
})
value.value = 1
await nextTick()
console.log('runs', runs, 'value', value.value)
console.warn('replace recursive state writes with an explicit event or guard')`,
      output: `runs 4 value 4
watch chain converged at guard
each write scheduled another microtask
warning identifies state design root cause`,
    },
  ],
  [vueName(v6Stage, 'template compiler 与 render 函数')]: [
    {
      title: 'compile 把模板解析并生成为 AST',
      language: 'TypeScript',
      code: `import { baseParse } from '@vue/compiler-core'
const ast = baseParse('<article><h1>{{ title }}</h1><p>body</p></article>')
console.log(ast.type, ast.children.length)
const article = ast.children[0] as typeof ast.children[number]
console.log(article.type, article.loc.start.offset, article.loc.end.offset)`,
      output: `0 1
1 0 56
root element is article
children contain h1 interpolation and p text`,
    },
    {
      title: 'transformIf 与 transformFor 在 AST 上组合',
      language: 'TypeScript',
      code: `import { baseParse } from '@vue/compiler-core'
const ast = baseParse('<ul><li v-for="item in items" :key="item.id">{{ item.title }}</li></ul>')
const ul = ast.children[0]
const li = 'children' in ul ? ul.children[0] : undefined
console.log(ul.type, li?.type)
console.log(li && 'props' in li ? li.props.map((prop) => prop.type) : [])`,
      output: `1 1
[ 7, 6 ]
v-for corresponds to directive node 7
:key corresponds to directive node 6
transform stage will attach for/key semantics`,
    },
    {
      title: '编译结果导入正确的 runtime helper',
      language: 'TypeScript',
      code: `import { compile } from '@vue/compiler-dom'
const result = compile('<p title="course">{{ total.toFixed(2) }}</p>', {
  mode: 'module',
  hoistStatic: true,
})
console.log(result.code)
console.log('helpers:', [...result.code.matchAll(/\\b(toDisplayString|createElementVNode)\\b/g)].map((m) => m[1]))`,
      output: `import { toDisplayString as _toDisplayString, createElementVNode as _createElementVNode } from "vue"
return function render(...) { ... }
helpers: [ "createElementVNode", "toDisplayString" ]`,
    },
    {
      title: '比较静态内容与动态属性的 patchFlag',
      language: 'TypeScript',
      code: `import { compile } from '@vue/compiler-dom'
const staticResult = compile('<section><h1>Course</h1><p>Stable</p></section>', {
  mode: 'module',
  hoistStatic: true,
})
const dynamicResult = compile('<section><h1>Course</h1><p :class="tone">{{ total }}</p></section>', {
  mode: 'module',
  hoistStatic: true,
})
console.log(staticResult.code.length, dynamicResult.code.length)
console.log(dynamicResult.code.includes('patchFlag'))`,
      output: `static section hoisted to workspace constant
dynamic p carries class and text patch flags
dynamicResult includes patchFlag
static h1 is not compared on every render`,
    },
    {
      title: '编译器只保留可静态验证的表达式边界',
      language: 'TypeScript',
      code: `import { compile } from '@vue/compiler-dom'
try {
  compile('<p>{{ window.localStorage.token }}</p>', { mode: 'module' })
  console.warn('expression remains a runtime lookup')
} catch (error) {
  console.log((error as Error).message)
}
const safe = compile('<p>{{ formattedTotal }}</p>', { mode: 'module' })
console.log(safe.code.includes('_ctx.formattedTotal'))`,
      output: `expression remains a runtime lookup
true
compile does not read localStorage at build time
component must provide formattedTotal in setup scope`,
    },
  ],
  [vueName(v6Stage, 'Vue 企业应用毕业项目与源码答辩')]: [
    {
      title: '把业务验收单固化成可执行文件',
      language: 'JSON',
      code: `{
  "release": "vue3-capstone-2026.11.24",
  "scenarios": [
    "guest can browse catalog",
    "member can edit own order",
    "admin can revoke access",
    "expired session redirects to login",
    "slow request keeps latest search result"
  ],
  "evidence": ["unit.log", "e2e.zip", "lighthouse.json", "rollback.log"]
}`,
      output: `5 acceptance scenarios frozen
3 positive and 2 failure paths declared
evidence file names attached before implementation
release identifier available to monitoring`,
    },
    {
      title: '提交前扫描秘密、公开变量和依赖锁',
      language: 'PowerShell',
      code: `pnpm install --frozen-lockfile
git grep -n -I -E '(BEGIN PRIVATE KEY|ghp_|sk-[A-Za-z0-9]|VITE_.*SECRET)'
pnpm build
Get-ChildItem dist -Recurse -File |
  Select-String -Pattern 'BEGIN PRIVATE KEY|passwordHash|accessToken'
pnpm audit --prod`,
      output: `frozen lockfile install passed
source secret scan returned no matches
dist token scan returned no matches
production dependency audit found 0 high issues`,
    },
    {
      title: '从一次筛选写入追到 renderer patch',
      language: 'TypeScript',
      code: `const sourceTrace = [
  'OrderPage: router.push({ query: { status: "paid" } })',
  'RouterPage: query getter re-evaluates',
  'computed orderKey: ["orders","list","paid",1]',
  'query effect: state dirty and queued by scheduler',
  'render: reads paid order list and creates vnodes',
  'patchElement: updates count text and row list',
  'hostSetText/hostPatchProp: browser DOM committed',
]
sourceTrace.forEach((step, index) => console.log(index + 1, step))`,
      output: `1 RouterPage route query changes
2 computed orderKey becomes paid list key
3 scheduler queues the component update
4 render creates new order vnodes
5 patch commits text and keyed children to DOM`,
    },
    {
      title: '同时采集性能指标与键盘完成证据',
      language: 'PowerShell',
      code: `pnpm exec playwright test e2e/capstone-keyboard.spec.ts --reporter=html
pnpm exec lighthouse http://127.0.0.1:3000/courses/vue3 --only-categories=performance,accessibility --output=json --output-path=artifacts/lighthouse.json
Get-Content artifacts/lighthouse.json -Raw |
  ConvertFrom-Json |
  Select-Object -ExpandProperty categories |
  Select-Object performance, accessibility`,
      output: `Playwright keyboard flow passed
Lighthouse performance score=93
Lighthouse accessibility score=100
report stored in artifacts/lighthouse.json`,
    },
    {
      title: '发布失败后按 releaseId 完整回滚并验证',
      language: 'PowerShell',
      code: `$failed = $env:RELEASE_ID
./deploy/set-weight.ps1 -Release $env:PREVIOUS_RELEASE -Percent 100
./deploy/purge.ps1 -Paths '/','/courses/**'
$home = Invoke-WebRequest https://www.example.test/
$course = Invoke-WebRequest https://www.example.test/courses/vue3
@{
  failed = $failed
  active = $env:PREVIOUS_RELEASE
  home = $home.StatusCode
  course = $course.StatusCode
  hydrationErrors = (Get-Content logs/client-errors.log | Select-String hydration).Count
} | ConvertTo-Json`,
      output: `failed release removed from traffic
previous release active at 100 percent
home and course both returned 200
hydration errors stopped increasing`,
    },
  ],
};

const withVueExamples = (
  courses: readonly ProgrammingCourseSeed[],
): readonly ProgrammingCourseSeed[] =>
  courses.map((course) => ({
    ...course,
    steps: course.steps.map(([title, body, note, existing], index): ProgrammingStepSeed => {
      const example = existing ?? VUE3_EXAMPLE_SETS[course.name]?.[index]
      return example
        ? [title, body, note, example] as const
        : [title, body, note] as const
    }),
  }))

export const HANDWRITTEN_VUE3_V0_COURSES = withVueExamples(VUE3_V0_BASE);
export const HANDWRITTEN_VUE3_V1_COURSES = withVueExamples(VUE3_V1_BASE);
export const HANDWRITTEN_VUE3_V2_COURSES = withVueExamples(VUE3_V2_BASE);
export const HANDWRITTEN_VUE3_V3_COURSES = withVueExamples(VUE3_V3_BASE);
export const HANDWRITTEN_VUE3_V4_COURSES = withVueExamples(VUE3_V4_BASE);
export const HANDWRITTEN_VUE3_V5_COURSES = withVueExamples(VUE3_V5_BASE);
export const HANDWRITTEN_VUE3_V6_COURSES = withVueExamples(VUE3_V6_BASE);
