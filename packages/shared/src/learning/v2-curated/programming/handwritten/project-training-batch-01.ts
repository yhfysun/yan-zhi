// P15 综合训练第一批手写样板：Studio、Pulse、TeamFlow 各 10 个阶段。
// 课程名必须与 projects.ts 中 PHASE_META 生成的 courseName 逐字一致。
import type { LearningV2LessonExample } from '../../../v2-types.js';
import type { ProgrammingCourseSeed } from '../shared.js';

const track = 'P15 · 综合训练项目' as const;

type ProjectExampleGrid = readonly (
  readonly (LearningV2LessonExample | undefined)[]
)[];

const example = (
  title: string,
  language: string,
  code: string,
  output: string,
): LearningV2LessonExample => ({ title, language, code, output });

function withProjectExamples(
  courses: readonly ProgrammingCourseSeed[],
  examples: ProjectExampleGrid,
): readonly ProgrammingCourseSeed[] {
  return courses.map((course, courseIndex) => ({
    ...course,
    steps: course.steps.map((step, stepIndex) => {
      const current = examples[courseIndex]?.[stepIndex] ?? step[3];
      if (!current) {
        throw new Error(`Missing project example: ${course.name} / ${step[0]}`);
      }
      return [step[0], step[1], step[2], current] as const;
    }),
  }));
}

const STUDIO_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · Studio 企业官网 · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '不要求编程经验，但需要能使用终端、编辑器和浏览器 DevTools，并愿意记录访谈与流程证据。',
    goal: '能把品牌负责人、潜在客户、内容编辑和移动访客的任务分开描述，产出一张可验证的用户任务卡、一张主流程与异常流程图，以及 Studio 首版明确不做的边界清单。',
    guidedPractice: '分别模拟四类角色完成一次咨询、更新案例、移动端浏览和内容审核；为每个动作记录触发条件、输入、系统反馈、成功标准和失败代价，再把同一条需求改写成“任务而不是页面”。',
    independentPractice: '独立交付三张用户任务卡、一张从首页到案例再到咨询的主流程图、一张包含空结果、网络失败和内容过期的异常流程图，并用一次同伴走查证明每张卡都能被第三人复述。',
    commonErrors: [
      '把“做一个案例页”直接当成需求，却没有说明访客为何进入、要比较什么证据、何时算完成咨询任务。',
      '只访谈品牌负责人，遗漏内容编辑和移动访客，导致页面上线后无法更新案例或用触屏提交表单。',
    ],
    sourceRefs: [
      'Nielsen Norman Group: User Interviews. https://www.nngroup.com/articles/user-interviews/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'WHATWG HTML Living Standard. https://html.spec.whatwg.org/',
    ],
    steps: [
      [
        '先画角色与决策链',
        'Studio 官网同时服务于外部客户和内部内容人员：品牌负责人决定服务如何表达，潜在客户判断案例是否可信，内容编辑负责长期更新，移动访客常在碎片时间完成浏览与咨询。先记录每个角色知道什么、需要比较什么、在哪个动作上会离开，而不是只写年龄和职业画像。',
        '角色描述必须连接到具体任务',
      ],
      [
        '把任务、阻碍和替代方案分开记录',
        '潜在客户的任务可能是“在三十秒内判断这家工作室做过同行业项目”，阻碍包括案例缺少行业标签、结果不可量化或联系入口埋在页尾，替代方案可能是去社交平台查看更新。内容编辑的任务是“不改代码发布案例”，阻碍是内容散落在组件中。三类信息分开记录，后续才能设计页面和验收。',
        '任务卡先写结果，再写界面',
        {
          title: '把四类用户任务打印成可检查的任务卡',
          language: 'javascript',
          code: `const tasks = [
  { actor: '潜在客户', trigger: '看到案例', success: '30 秒内找到行业与结果' },
  { actor: '内容编辑', trigger: '发布新案例', success: '不改组件即可更新内容' },
  { actor: '移动访客', trigger: '打开联系页', success: '触屏完成咨询且错误可读' },
  { actor: '品牌负责人', trigger: '评审首页', success: '服务差异与报价方式清晰' },
];

for (const task of tasks) {
  console.log([task.actor, task.trigger, task.success].join(' | '));
}`,
          output: `潜在客户 | 看到案例 | 30 秒内找到行业与结果
内容编辑 | 发布新案例 | 不改组件即可更新内容
移动访客 | 打开联系页 | 触屏完成咨询且错误可读
品牌负责人 | 评审首页 | 服务差异与报价方式清晰`,
        },
      ],
      [
        '主流程和异常流程一起走',
        '主流程从访客进入首页开始，经过服务理解、案例筛选和联系提交；异常流程至少包含案例为空、筛选无结果、表单请求失败、图片加载失败和内容过期。每一步都写输入、界面状态、系统反馈和退出路径，尤其是提交失败后保留已填内容，避免用户重新输入。',
        '异常流程必须能回到主任务',
      ],
      [
        '用真实内容验证理解是否成立',
        '从工作室现有资料中选三条案例，分别记录客户背景、问题、做了什么、结果和可公开证据；若缺少结果数据，就把“结果待补充”标成内容风险，不要编造指标。联系方式也要和真实工作流对齐，明确首版是邮件通知、本地 mock 还是人工复制，避免把未接 CRM 说成已经自动化。',
        '内容缺口也是需求证据',
      ],
      [
        '用可复述性完成阶段交接',
        '阶段结束前让另一位同学只看任务卡和流程图，复述谁会访问、为什么来、如何判断成功、失败后去哪里。若对方需要猜测页面结构或业务规则，说明证据仍不完整。最后把非目标写清：首版不做在线支付、不接真实 CRM、不做复杂动画系统，并记录这些决定由谁确认。',
        '第三人能复述才算理解完成',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已完成 Studio 用户任务卡和主流程，能区分访客目标、内容编辑目标与品牌负责人的约束。',
    goal: '能把 Studio 首版收敛为五个页面和三条真实案例，写出可执行的成功与失败验收场景，并把 LCP、CLS、移动宽度、键盘操作和表单错误纳入同一张验收表。',
    guidedPractice: '把原始需求拆成“必须有、以后再做、明确不做”三列；把首页、案例和联系流程各写一条 Given/When/Then，再把 LCP、CLS、320px 溢出和 axe 严重问题转成可测量的门槛。',
    independentPractice: '交付一份 MVP 范围表和一张验收矩阵，要求每条标准都包含触发条件、观察值、通过线和不通过的修复动作，并用另一个同学检查是否存在无法判断好坏的空泛表述。',
    commonErrors: [
      '把“页面好看”“体验流畅”写成验收标准，却没有视口、时间、交互路径或可观察结果。',
      '把内容编辑、SEO、表单失败和移动导航都塞进首版，导致页面数量与项目时间失控。',
    ],
    sourceRefs: [
      'web.dev Core Web Vitals. https://web.dev/articles/vitals',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'Playwright Documentation. https://playwright.dev/docs/intro',
    ],
    steps: [
      [
        '先把 MVP 钉在页面与内容上',
        'Studio 首版锁定首页、服务页、案例页、关于页和联系页，内容侧只保留三条真实案例；案例筛选、在线支付、真实 CRM 和复杂动画分别标成后续或非目标。页面清单必须对应导航与 URL，避免开发到一半才临时增加“团队博客”或“客户登录”。',
        '页面数量与内容条数都要固定',
      ],
      [
        '验收语句必须能被第三者执行',
        '把“首页清楚”改写成“访客能在 30 秒内从首屏找到服务、行业案例与咨询入口”，把“表单可用”改写成“空邮箱提交后焦点落到邮箱输入，错误文本通过 aria-describedby 关联且页面不刷新”。每条场景都写前置状态、操作、预期反馈和失败证据。',
        'Given/When/Then 不要省略输入状态',
      ],
      [
        '性能预算绑定真实页面',
        '首屏 LCP 目标为 2.5 秒以内，CLS 目标小于 0.1，320 到 1440 像素不得横向溢出；图片必须预留宽高或宽高比，首屏主图不能依赖滚动后才加载。预算要在同一台设备、同一网络模板和同一构建产物上测量，开发服务器热更新数据不能作为上线结论。',
        '性能数字必须绑定测量环境',
        {
          title: '用脚本检查 Studio 的验收预算',
          language: 'javascript',
          code: `const acceptance = [
  { id: 'A1', metric: 'LCP', observed: 2.1, budget: 2.5 },
  { id: 'A2', metric: 'CLS', observed: 0.04, budget: 0.1 },
  { id: 'A3', metric: 'overflowPx', observed: 0, budget: 0 },
  { id: 'A4', metric: 'axeSerious', observed: 0, budget: 0 },
];

for (const item of acceptance) {
  const passed = item.observed <= item.budget;
  console.log((passed ? 'PASS ' : 'FAIL ') + item.id + ' ' + item.metric +
    ' observed=' + item.observed + ' budget=' + item.budget);
}`,
          output: `PASS A1 LCP observed=2.1 budget=2.5
PASS A2 CLS observed=0.04 budget=0.1
PASS A3 overflowPx observed=0 budget=0
PASS A4 axeSerious observed=0 budget=0`,
        },
      ],
      [
        '非功能目标同时覆盖无障碍与移动端',
        '键盘用户可以打开移动导航、关闭导航、筛选案例并完成表单；焦点顺序与视觉顺序一致，错误不能只靠颜色表达。320px 视口下导航、案例标题和提交按钮不得被固定元素遮住，触控目标至少保持可操作尺寸。axe 只做自动扫描，仍需人工走一遍 Tab、Esc 和错误提示朗读。',
        '自动扫描不能替代真实键盘路径',
      ],
      [
        '范围变更必须带回验收表',
        '任何新增页面、动画或第三方脚本都先回答：它服务哪张任务卡、影响哪条指标、会增加哪些资源与失败路径。若答案不能写进验收矩阵，就进入待办而不是当前迭代。阶段结束时冻结首版范围，并把未做项、原因和重新评估条件交给下一阶段。',
        '没有验收关联的需求不进入首版',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有冻结的 Studio MVP 与验收矩阵，理解 HTTP 请求、响应状态码和 JSON 对象。',
    goal: '能定义页面、案例、服务和联系表单的内容 schema，写清联系请求的成功、校验失败、限流和重复提交响应，并让前端在只有契约的情况下独立开发加载、空、错误和离线状态。',
    guidedPractice: '先写三个资源的字段、必填性、枚举和示例 JSON，再定义 POST /api/inquiries 的请求与响应；用故意错误的邮箱、重复提交和超时分别走一次契约评审，并把前端需要展示的错误文案与稳定错误码分开。',
    independentPractice: '交付 content.schema.json、inquiry.request.json、inquiry.error.json 和一张前端请求矩阵，矩阵覆盖首次加载、筛选无结果、提交成功、422 校验失败、429 限流、超时和重复提交。',
    commonErrors: [
      '只定义成功响应，前端遇到 422、429 或网络中断时只能显示“出错了”，用户不知道如何修正。',
      '把页面标题、SEO 描述和案例正文分别散落在组件里，内容编辑更新时无法形成一个可验证的内容对象。',
    ],
    sourceRefs: [
      'JSON Schema. https://json-schema.org/',
      'MDN HTTP response status codes. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status',
      'web.dev Fetch API. https://web.dev/articles/introduction-to-fetch',
    ],
    steps: [
      [
        '内容对象先有稳定标识和版本',
        '案例不能只是一段展示文本，至少包含 slug、行业、标题、摘要、问题、行动、结果、证据链接和发布状态；服务和页面也有稳定 id、排序和 SEO 字段。每个接口要固定方法、路径、请求与响应 schema，并说明字段是否必填、枚举范围和更新规则；前端只依赖 schema，不从组件名称倒推数据结构。',
        'slug 与 id 不能互相代替',
      ],
      [
        '联系表单只暴露必要字段',
        '请求字段限定为姓名、邮箱、公司、项目类型、预算区间、需求描述和页面来源，不收集与服务无关的敏感信息。前端必须在提交前做格式校验，服务端仍需重复校验；邮箱、描述和项目类型分别返回字段级错误，方便把错误关联到具体输入框。',
        '前端校验不等于服务端校验',
      ],
      [
        '错误结构要稳定且可本地化',
        '建议使用 code、message、field、requestId 四个核心字段：code 供程序判断，message 供人阅读，field 指向输入，requestId 用于日志追踪。422 表示字段校验失败，429 表示限流，503 表示通知服务暂不可用；不要让前端解析不同句子的错误文案来决定重试。',
        '程序判断 code，人阅读 message',
        {
          title: '生成一次稳定可读的联系请求校验结果',
          language: 'javascript',
          code: `function validateContact(input) {
  const errors = [];
  if (!input.name?.trim()) errors.push({ code: 'NAME_REQUIRED', field: 'name' });
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(input.email || '')) {
    errors.push({ code: 'EMAIL_INVALID', field: 'email' });
  }
  if ((input.message || '').length < 20) {
    errors.push({ code: 'MESSAGE_TOO_SHORT', field: 'message' });
  }
  return errors.length === 0
    ? { ok: true, request: { ...input, source: 'studio-site' } }
    : { ok: false, errors };
}

console.log(JSON.stringify(validateContact({
  name: '林舟',
  email: 'linzhou.example.com',
  message: '需要重做官网',
}), null, 2));`,
          output: `{
  "ok": false,
  "errors": [
    {
      "code": "EMAIL_INVALID",
      "field": "email"
    },
    {
      "code": "MESSAGE_TOO_SHORT",
      "field": "message"
    }
  ]
}`,
        },
      ],
      [
        '前端数据边界按状态拆开',
        '首页首屏优先读取已发布的服务与三条案例，案例筛选只改变查询参数并保留 URL 可恢复性；联系表单维护 idle、validating、submitting、success、error 状态，提交失败保留草稿。离线、超时和 429 要显示不同恢复动作，不能都自动重试并造成重复申请。',
        '每个状态都要有退出路径',
      ],
      [
        '用契约样例做并行开发',
        '后端尚未接真实通知时，前端使用固定样例和 mock service，但请求路径、错误码和字段结构与契约一致。为 schema 写样例校验，为错误响应写快照，为重复提交写幂等键测试；只有契约测试通过后，才允许替换 mock 实现。',
        'mock 与真实实现必须共享契约',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已完成 Studio 内容与联系接口契约，能写基本 SQL，并理解主键、唯一约束和发布状态。',
    goal: '能为页面、服务、案例和咨询提交设计最小数据模型，用唯一约束保护 slug、用状态字段表达草稿与发布，并写出可在旧数据存在时执行的迁移、回填和回滚步骤。',
    guidedPractice: '在本地 SQLite 或 PostgreSQL 建 case_study、inquiry 两张表，插入三条草稿和一条重复 slug，观察约束拒绝；再写 publish_at、status 和索引，用查询计划检查案例列表与行业筛选。',
    independentPractice: '交付一份 DDL、一份带三条案例的 seed、一份重复 slug 与非法状态实验、一份迁移回滚说明；要求数据库能主动拒绝空标题、未知状态和重复案例键。',
    commonErrors: [
      '只在 TypeScript 类型里限制发布状态，数据库仍允许写入拼错的状态或空 slug。',
      '直接删掉旧列完成迁移，没有兼容旧版本、回填数据和回滚方案。',
    ],
    sourceRefs: [
      'SQLite Constraint Documentation. https://www.sqlite.org/lang_createtable.html',
      'PostgreSQL Documentation: Constraints. https://www.postgresql.org/docs/current/ddl-constraints.html',
      'PostgreSQL Documentation: Indexes. https://www.postgresql.org/docs/current/indexes.html',
    ],
    steps: [
      [
        '页面、服务与案例分开建模',
        'page 保存路由、标题和 SEO 元数据，service 保存服务名称、摘要和排序，case_study 保存客户背景、行业、结果和证据；页面与案例通过稳定 slug 建立可读链接。不要把整页 HTML 塞进一个 JSON 字段后完全放弃关系，也不要在首版为了未来复杂性过度拆表。',
        '模型先服务查询与更新',
      ],
      [
        'slug 和状态需要数据库级约束',
        'slug 必须非空且唯一，状态限定为 draft、review、published、archived，发布时间在发布状态下不能为空；标题和摘要设置长度边界。约束位置越靠近数据越可靠，前端和后端校验负责给出友好错误，数据库负责最终拒绝非法数据。',
        '数据库是最后一道状态守卫',
      ],
      [
        '咨询提交只保留完成服务所需信息',
        'inquiry 记录姓名、邮箱、项目类型、预算区间、描述、来源页面、创建时间、处理状态和 request_id；request_id 唯一可以配合幂等，敏感字段不能出现在公开内容表。删除或导出策略要提前说明，避免把用户描述永久散落在日志和备份里。',
        'request_id 同时服务幂等与追踪',
        {
          title: '用唯一约束验证案例 slug',
          language: 'sql',
          code: `CREATE TABLE case_study (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK (length(title) > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT
);

INSERT INTO case_study (id, slug, title, status, published_at)
VALUES (1, 'atlas-onboarding', 'Atlas 新人引导', 'published', '2026-10-01');

INSERT OR IGNORE INTO case_study (id, slug, title, status, published_at)
VALUES (2, 'atlas-onboarding', '重复案例', 'draft', NULL);

SELECT COUNT(*) AS cases FROM case_study;
SELECT changes() AS duplicate_inserted;`,
          output: `cases
1
duplicate_inserted
0`,
        },
      ],
      [
        '迁移按先兼容再切换执行',
        '新增列先允许空，回填旧数据的默认值和发布时间，再部署同时能读新旧结构的代码，最后加非空或唯一约束。删除旧列前保留一个发布周期的兼容读路径，并准备从备份或兼容视图恢复的脚本；迁移文件只向前执行，回滚通过新迁移完成。',
        '旧代码与新代码必须短暂并存',
      ],
      [
        '查询模式决定索引与缓存',
        '案例列表按 status、published_at 和行业筛选，索引应覆盖状态和发布时间；后台按 slug 读取单条案例，唯一索引已经足够。缓存键要包含内容版本和筛选条件，发布后主动失效列表；用 EXPLAIN 验证查询计划，避免只凭数据量小就认为索引无用。',
        '先写查询再补索引',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '已确认内容 schema 和联系接口，能使用 Node.js、pnpm 以及浏览器 DevTools。',
    goal: '能从空目录建立 Vite、TypeScript 和静态资源工程，按页面、内容适配器、组件和 mock service 划分边界，并让另一名同学按 README 在本地完成安装、启动、构建和测试。',
    guidedPractice: '创建 src/pages、src/features、src/content、src/lib 和 tests 目录；把页面路由、案例数据读取、表单校验和 mock 请求分别放到独立模块，运行 dev、build、test 三条命令并记录耗时与依赖版本。',
    independentPractice: '交付可运行骨架、模块依赖图、package.json 脚本、锁定文件和一页环境复现说明；在干净目录按说明重装一次，确认不依赖你机器上的全局包或未提交配置。',
    commonErrors: [
      '把内容、请求、DOM 操作和页面布局都写进 main.ts，导致案例筛选和表单无法单测。',
      '只提交 src 而不提交 package.json、锁文件和配置文件，另一台机器无法复现同一构建。',
    ],
    sourceRefs: [
      'Vite Guide. https://vite.dev/guide/',
      'pnpm Documentation. https://pnpm.io/motivation',
      'TypeScript tsconfig Reference. https://www.typescriptlang.org/tsconfig/',
    ],
    steps: [
      [
        '目录边界对应变化来源',
        'src/pages 只负责路由与页面组合，src/features 按案例筛选、联系表单等任务拆分，src/content 提供内容读取与类型适配，src/lib 放通用纯函数。内容编辑和交互逻辑不直接依赖彼此，组件才能在不启动整页的情况下测试。',
        '目录应表达职责而不是技术堆叠',
      ],
      [
        '内容适配器隔离文件格式',
        '首版可以读取本地 JSON，但页面只调用 getPublishedCases 和 getServices，不直接 import 数据文件。适配器负责校验 schema、排序、默认值和发布过滤；未来改接口或 CMS 时只替换适配器，页面和组件契约保持稳定。',
        '页面不依赖具体存储介质',
      ],
      [
        'mock 只模拟网络边界',
        '联系表单通过 submitInquiry 调用 mock service，mock 返回稳定成功、422、429 和超时结构；页面不判断 fetch 是否失败，而是消费统一结果。切换到真实接口时仍保留同一函数签名，这样错误 UI 与重试策略可以提前完成。',
        'mock 的返回要和契约一致',
      ],
      [
        '本地环境固定版本和命令',
        'README 记录 Node.js、pnpm、浏览器和 Playwright 版本，package.json 提供 dev、build、test、test:e2e 脚本，锁文件必须提交。环境变量只保存公开的 base URL 或 mock 开关，不把访问令牌和密钥写进示例文件。',
        '版本与命令必须进入仓库',
        {
          title: '检查 Studio 骨架是否包含可复现入口',
          language: 'javascript',
          code: `import { access, readFile } from 'node:fs/promises';

const required = [
  'src/main.ts',
  'src/pages/home.ts',
  'src/content/cases.json',
  'src/features/contact.ts',
  'vite.config.ts',
  'pnpm-lock.yaml',
];

await Promise.all(required.map((path) => access(path)));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
console.log('files=ok');
console.log('scripts=' + Object.keys(pkg.scripts).sort().join(','));`,
          output: `files=ok
scripts=build,dev,test,test:e2e`,
        },
      ],
      [
        '用干净环境完成复现验收',
        '阶段结束前，在临时目录删除 node_modules，按 README 执行安装、启动、构建和测试；记录首次失败信息与修复。若必须使用全局命令或手动复制文件才能跑通，说明环境仍未固化。最后把模块依赖图与非目标交给下一阶段。',
        '能复现才算完成项目骨架',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: '已完成 Studio 工程骨架和联系接口契约，能写 TypeScript 函数并用 curl 或 fetch 发送请求。',
    goal: '能实现联系申请的校验、幂等、模拟通知、结构化错误和日志脱敏，证明重复提交不会产生两条申请，且网络失败后用户仍能保留草稿并安全重试。',
    guidedPractice: '用 Node.js 内置 HTTP 服务实现 POST /api/inquiries，先将请求校验、idempotency-key 和响应状态拆开，再依次发送正确请求、相同幂等键的重复请求和非法邮箱请求。',
    independentPractice: '交付一个可运行的联系 mock 服务、三条 curl 或 fetch 实验记录、一份错误码表和一页日志样例；日志不能出现完整邮箱、完整需求描述或密钥。',
    commonErrors: [
      '只在前端校验邮箱，服务端收到空字段或超长描述后仍然写入申请。',
      '把每次按钮点击都当成新申请，网络超时后用户重试会生成重复咨询记录。',
    ],
    sourceRefs: [
      'Node.js HTTP Documentation. https://nodejs.org/api/http.html',
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'MDN HTTP Idempotent. https://developer.mozilla.org/en-US/docs/Glossary/Idempotent',
    ],
    steps: [
      [
        '申请先进入明确的状态机',
        '联系申请可以处于 received、validated、queued、notified、failed 和 retryable 等状态；收到请求只代表服务端已接收，不代表通知已经送达。状态转换必须由事件驱动，失败后保留请求 id、错误码和下一次可重试时间，不能靠页面按钮文字猜测后端进度。',
        '收到请求不等于通知成功',
      ],
      [
        '校验规则在服务端再次执行',
        '姓名、邮箱、需求描述和项目类型都要设置长度与格式边界，未知字段不进入存储，HTML 和脚本片段按纯文本处理。服务端返回字段级错误，不把内部堆栈和数据库信息发给浏览器；前端根据 field 和 code 将焦点带回对应输入。',
        '服务端负责拒绝非法输入',
      ],
      [
        '通知服务通过接口隔离',
        '首版不接真实 CRM 时，通知模块接收 normaliseInquiry 后生成一条固定消息，并记录 delivery_status；未来替换为邮件或 Webhook 只改适配器。发送超时要进入 retryable，发送成功也不能把用户原文写入普通日志，只记录 request_id 和模板版本。',
        '适配器隔离外部副作用',
      ],
      [
        '幂等键保护重复提交',
        '浏览器首次提交时生成随机 idempotency-key，同一次表单会话的重试复用该键；服务端把键与请求摘要关联，相同摘要返回之前的 201 或 200，不同内容返回 409。这样既防止重复写入，也能发现客户端误用旧键。',
        '幂等键与业务结果必须绑定',
        {
          title: '验证联系接口的校验、幂等和重试',
          language: 'javascript',
          code: `import { createServer } from 'node:http';

const seen = new Map();
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  if (!String(body.email || '').includes('@')) {
    res.writeHead(422, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'EMAIL_INVALID', field: 'email' }));
    return;
  }
  const key = String(req.headers['idempotency-key'] || '');
  if (seen.has(key)) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ requestId: seen.get(key), duplicate: true }));
    return;
  }
  const requestId = 'req-' + (seen.size + 1);
  seen.set(key, requestId);
  res.writeHead(201, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ requestId, duplicate: false }));
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const url = 'http://127.0.0.1:' + port + '/api/inquiries';
const send = (email, key) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': key },
  body: JSON.stringify({ email, message: '希望讨论官网改版项目' }),
});
const first = await send('hello@example.com', 'form-7');
const retry = await send('hello@example.com', 'form-7');
const invalid = await send('bad', 'form-8');
console.log('first', first.status);
console.log('retry', retry.status);
console.log('invalid', invalid.status);
server.close();`,
          output: `first 201
retry 200
invalid 422`,
        },
      ],
      [
        '失败恢复以用户草稿为中心',
        '提交前保存非敏感草稿，提交超时显示“请求可能已收到，请使用同一提交号重试”，而不是清空所有输入。429 展示等待时间，503 提供稍后重试和邮件备用入口；进入成功页后清除草稿，并记录 request_id 供客服查询。',
        '重试不能制造第二次申请',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: '完成内容适配器、联系 mock 和验收矩阵，能使用语义化 HTML、CSS 布局及浏览器键盘操作。',
    goal: '能实现 Studio 的响应式导航、案例筛选和联系表单，覆盖加载、空结果、错误、成功、键盘焦点和 320px 移动布局，并保证动效减弱偏好下仍可完成任务。',
    guidedPractice: '先写语义化 HTML 与可聚焦控件，再加 CSS 和少量状态脚本；用 Tab、Shift+Tab、Enter、Space、Esc 走通移动导航和表单错误修复，最后在 320、768 和 1440 三个视口截图。',
    independentPractice: '交付首页、案例页和联系页的可访问版本，附桌面与移动截图、键盘走查表、空筛选截图、422 错误截图和 reduced-motion 检查记录。',
    commonErrors: [
      '用 div 加 click 监听模拟按钮和链接，导致键盘不能聚焦，屏幕阅读器也听不到可操作角色。',
      '移动导航打开后遮住页面内容却没有关闭按钮和焦点管理，用户只能刷新页面才能继续。',
    ],
    sourceRefs: [
      'WAI-ARIA Authoring Practices. https://www.w3.org/WAI/ARIA/apg/',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'Playwright Accessibility Testing. https://playwright.dev/docs/accessibility-testing',
    ],
    steps: [
      [
        '响应式导航先解决遮挡和焦点',
        '导航在桌面显示为水平链接，窄屏改为有明确名称的菜单按钮；打开后焦点进入菜单，Esc 可关闭并把焦点还给按钮，关闭后页面滚动恢复。菜单不能用只有图标的无名称按钮，也不能用固定定位盖住当前标题而不给关闭路径。',
        '打开、关闭和焦点归还都要验收',
      ],
      [
        '案例筛选保留 URL 与空状态',
        '行业筛选使用可操作控件而不是只靠颜色矩形，筛选值写入 URL 查询参数，刷新后能够恢复；无结果时说明当前筛选与清除方式，并保留返回全部案例的按钮。卡片标题、行业和结果按阅读顺序排列，图片或图形不作为唯一信息来源。',
        '筛选状态必须可在刷新后恢复',
      ],
      [
        '表单错误关联到具体字段',
        'label 与输入框通过 for/id 关联，帮助文本和错误文本使用 aria-describedby；提交失败后焦点落到第一个错误字段，并通过 aria-live 播报摘要。邮箱、需求和预算错误分别可读，按钮在提交中保持状态但不重复触发。',
        '错误不能只改变边框颜色',
      ],
      [
        '焦点、滚动和动效服务阅读顺序',
        '页面路由切换后把焦点放到主标题，跳转链接允许键盘用户跳过导航；粘性页头和锚点滚动要为主内容预留空间，避免标题被遮住。prefers-reduced-motion 开启时关闭大幅位移与自动滚动，但不能删除状态反馈。',
        '焦点顺序应与视觉阅读顺序一致',
        {
          title: '验证移动联系表单的错误可读性',
          language: 'javascript',
          code: `import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
await page.goto('http://localhost:5173/contact');
await page.getByLabel('联系邮箱').fill('not-an-email');
await page.getByRole('button', { name: '提交咨询' }).click();
console.log('alert=' + await page.getByRole('alert').textContent());
console.log('focus=' + await page.evaluate(() => document.activeElement?.getAttribute('name')));
console.log('overflow=' + await page.evaluate(() =>
  document.documentElement.scrollWidth > window.innerWidth));
await browser.close();`,
          output: `alert=请输入有效的联系邮箱
focus=email
overflow=false`,
        },
      ],
      [
        '用真实路径完成页面验收',
        '除正常点击外，还要验证键盘打开导航、清空筛选、提交错误表单、成功提交和断网重试；截图只能证明某个时刻的视觉结果，不能替代可访问名称与焦点检查。检查 320px 下标题是否换行、按钮是否被遮住、长案例名是否撑破卡片。',
        '视觉、键盘和状态三条路径同时通过',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Studio 页面与联系 mock 已可运行，能运行 Playwright、读取 Lighthouse 报告并查看网络请求。',
    goal: '能建立内容适配器单测、联系契约测试、三个断点的页面测试和关键页可访问性扫描，并用 Lighthouse 与资源瀑布证据证明 LCP、CLS 和表单失败路径符合预算。',
    guidedPractice: '先为案例排序、发布过滤和表单校验写单测，再用 mock 422、429、超时验证 UI；最后在 home、cases、contact 三个页面执行 axe、键盘走查和 320/768/1440 截图矩阵。',
    independentPractice: '交付测试报告，包含测试命令、通过率、失败样本、Lighthouse 前后对比、两个缺陷的复现与修复记录，以及一份图片优化或缓存策略说明。',
    commonErrors: [
      '只测正常点击成功提交，不测超时、限流、重复提交和键盘返回路径。',
      '在开发服务器上测性能并把热更新资源算进首屏，得到无法复现的 LCP 结论。',
    ],
    sourceRefs: [
      'Playwright Test Documentation. https://playwright.dev/docs/intro',
      'axe-core Documentation. https://github.com/dequelabs/axe-core',
      'web.dev Core Web Vitals. https://web.dev/articles/vitals',
    ],
    steps: [
      [
        '测试分层从纯函数开始',
        '内容适配器和表单校验是纯函数，应先用固定样例覆盖空数组、发布过滤、非法邮箱、超长描述和重复提交键；页面测试只验证用户可见行为，避免把内部实现细节写进大量脆弱断言。',
        '先测边界逻辑，再测浏览器路径',
      ],
      [
        '断点矩阵覆盖真实移动任务',
        '320、768 和 1440 三个宽度都要打开导航、筛选案例和提交错误表单；检查横向溢出、遮挡、触控尺寸和长文本。截图命名包含页面、状态、宽度与提交版本，便于回归时定位差异。',
        '截断测试不能只看静态首页',
      ],
      [
        '自动可访问性扫描后仍需人工走查',
        'axe 能发现缺失名称、低对比度和部分结构问题，但不能判断菜单焦点是否合理、错误播报是否及时。人工用键盘完成导航、筛选、打开错误和返回首页，记录每一步焦点位置与朗读内容。',
        '扫描通过不等于键盘可用',
      ],
      [
        '性能证据来自生产构建',
        '用 pnpm build 后的静态产物启动预览服务器，再采集 LCP、CLS、资源体积和缓存头。首屏图片使用合适格式、明确尺寸和懒加载边界，字体避免阻塞，第三方脚本不得无条件加入首屏。',
        '性能只认可生产构建产物',
        {
          title: '把 Lighthouse 与页面约束汇总成门禁',
          language: 'javascript',
          code: `const result = {
  lcpSeconds: 2.1,
  cls: 0.04,
  axeSerious: 0,
  horizontalOverflow: false,
  formFailureVisible: true,
};

const checks = [
  ['LCP', result.lcpSeconds <= 2.5],
  ['CLS', result.cls < 0.1],
  ['axe', result.axeSerious === 0],
  ['overflow', result.horizontalOverflow === false],
  ['form-failure', result.formFailureVisible === true],
];

for (const [name, passed] of checks) {
  console.log((passed ? 'PASS ' : 'FAIL ') + name);
}
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;`,
          output: `PASS LCP
PASS CLS
PASS axe
PASS overflow
PASS form-failure`,
        },
      ],
      [
        '安全和隐私按数据流检查',
        '联系表单不把令牌写进前端包，不接受 HTML 直接插入页面，跨域请求只允许部署域名；日志不保存完整邮箱和需求原文，第三方分析脚本要说明采集字段。静态站点也要检查依赖漏洞、资源完整性和表单垃圾提交防护。',
        '安全边界跟随每一份用户输入',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Studio 生产构建、性能和可访问性测试已通过，了解静态文件服务器、HTTP 缓存头和基础 CI。',
    goal: '能把 Studio 构建成不可变静态制品，配置 Nginx 或 CDN 的缓存与安全头，接入构建、测试、预览、发布和冒烟检查，并写清静态版本的回滚步骤。',
    guidedPractice: '写多阶段 Dockerfile 或等价静态发布脚本，固定 Node 与 Nginx 版本；构建后检查 dist 文件清单、缓存头、404 页和 gzip/brotli，再从预览环境执行一次首页、案例页和联系表单冒烟。',
    independentPractice: '交付 Dockerfile 或发布脚本、CI 配置、缓存策略表、冒烟脚本和一页回滚说明；要求另一名同学能根据文档把上一个静态版本恢复并验证资源没有混用。',
    commonErrors: [
      '把 node_modules、源码和开发服务器直接发布到生产静态目录，导致体积和攻击面扩大。',
      'HTML 与带哈希的静态资源使用相同长缓存，发布后浏览器继续引用旧资源或新页面找不到旧资源。',
    ],
    sourceRefs: [
      'Docker Multi-stage Builds. https://docs.docker.com/build/building/multi-stage/',
      'nginx Documentation. https://nginx.org/en/docs/',
      'web.dev HTTP Caching. https://web.dev/articles/http-cache',
    ],
    steps: [
      [
        '构建阶段与运行阶段分离',
        '多阶段构建只在 build 阶段安装依赖、执行测试和生成 dist，运行阶段仅包含静态文件、Nginx 与必要配置。锁文件和固定基础镜像保证同一提交产出相同文件；构建参数不得包含私人令牌。',
        '制品只保留运行所需内容',
      ],
      [
        '缓存头按文件稳定性区分',
        '带内容哈希的 JS、CSS 和字体可长缓存 immutable，HTML 和内容 JSON 使用短缓存或必须重新验证；404、错误页和安全头也要在服务器配置中验证。发布时先上传静态资源再切换 HTML，避免旧 HTML 指向尚未上传的新文件。',
        '先上传资源，再切换入口',
      ],
      [
        'CI 固定执行构建、测试和预览',
        '流水线至少包含 install、lint、test、build、image 或 artifact、preview smoke 六个阶段；失败时保留测试报告与构建产物摘要。预览环境使用与生产相同的路由和缓存头，不能只在开发者本机通过。',
        '预览环境必须接近生产',
      ],
      [
        '可观测性覆盖静态站点真实体验',
        '记录构建版本、部署时间、页面路径、LCP/CLS、资源 404、表单请求成功率和 CDN 缓存命中；RUM 数据按版本区分，日志不采集用户完整需求。没有后端时也要有前端错误与资源失败信号。',
        '指标与日志按发布版本关联',
        {
          title: '建立可回滚的静态站点多阶段镜像',
          language: 'dockerfile',
          code: `FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm test && pnpm build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,
          output: `docker build -t studio-site:r41 .
docker run --rm -p 8080:80 studio-site:r41
GET /studio-site/index.html -> 200
GET /_assets/app.6f3a1.css -> 200
GET /missing.png -> 404`,
        },
      ],
      [
        '回滚以入口文件为单位',
        '每次发布保留完整静态制品和版本清单，回滚时先恢复上一版 HTML 与 manifest，再确认它引用的哈希资源仍在 CDN。完成首页、案例页、联系表单和 404 冒烟后记录事故时间线；如果缓存未失效，需按代理层规则主动 pur ge 并说明传播时间。',
        '回滚也必须验证跨资源一致性',
      ],
    ],
  },
  {
    name: '综合训练 · Studio 企业官网 · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'Studio 已具备静态发布、冒烟和回滚文档，能读取 CDN、Nginx 与浏览器 Network 证据。',
    goal: '能制造资源 404、表单超时、慢网络和错误静态版本，做出安全停发与回滚决定，并用架构取舍、证据和未解决问题完成项目答辩。',
    guidedPractice: '依次断开图片资源、让联系 mock 延迟十秒、替换一个错误 HTML 版本和模拟 CDN 未刷新，记录页面表现、告警、用户影响与恢复动作；每次演练只改变一个变量并保留时间线。',
    independentPractice: '交付故障演练报告、回滚录屏或日志、RUM 与 Lighthouse 对比、ADR 和答辩提纲；要求答辩能在十分钟内说明用户任务、架构、指标、两次取舍和下一步。',
    commonErrors: [
      '只看首页是否打开发布结论，没有验证案例深链、联系表单和旧资源是否仍可用。',
      '把故障原因写成“网络问题”或“CDN 问题”，没有时间、请求路径、版本和恢复证据。',
    ],
    sourceRefs: [
      'Google SRE Workbook: Incident Response. https://sre.google/workbook/incident-response/',
      'web.dev Debugging. https://web.dev/learn/performance/debug',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
    ],
    steps: [
      [
        '先演练可观察的静态资源失败',
        '删除或改名一个首屏图片和一段 CSS，观察页面是否失去可读性、是否有 404 日志、alt 与降级样式是否生效；再恢复文件确认缓存是否需要刷新。资源失败演练要区分“图片不可用”和“页面结构失效”。',
        '资源失败也要保持任务可完成',
      ],
      [
        '表单故障按用户恢复路径演练',
        '让 mock 返回 503、429 和超时，检查提示、草稿、幂等键和备用邮箱入口；失败时页面不能清空输入，也不能把网络异常显示成成功。恢复后使用同一提交号重试，确认客服端只看到一条申请。',
        '失败后的下一步必须明确',
      ],
      [
        'CDN 与缓存错误会造成版本混用',
        '模拟 HTML 已切换但旧哈希资源未上传，或旧 HTML 仍引用已删除资源；用 Network 记录请求 URL、cache-control、age 和响应版本。修复顺序应是恢复资源、切换入口、刷新缓存、再验证深链与表单。',
        '版本一致性优先于恢复速度',
      ],
      [
        '回滚决策要有门槛与负责人',
        '当关键页面无法访问、联系任务中断或错误资源超过既定时间仍无法修复时触发回滚；回滚前记录当前版本、影响页面和最后一次已知正常版本。恢复后执行首页、案例、联系、404 和移动断点检查。',
        '回滚门槛要提前写成可观察条件',
        {
          title: '用健康证据决定发布还是回滚',
          language: 'javascript',
          code: `const current = { version: 'r42', homepage: true, cases: false, form: false, lcp: 4.1 };
const previous = { version: 'r41', homepage: true, cases: true, form: true, lcp: 2.1 };

function decide(next, fallback) {
  const critical = next.homepage && next.cases && next.form;
  const performance = next.lcp <= 2.5;
  const action = critical && performance ? 'keep' : 'rollback';
  const target = action === 'keep' ? next : fallback;
  return action + ':' + target.version;
}

console.log(decide(current, previous));`,
          output: `rollback:r41`,
        },
      ],
      [
        '项目答辩用证据串起取舍',
        '答辩先说明谁会用什么任务，再展示任务卡、架构图、页面与接口契约，最后用测试和故障演练证明边界。至少解释一个没有做的功能、一个被否决的方案和一个下一步，不要只逐页展示截图。',
        '答辩要让证据支持每个设计决定',
      ],
    ],
  },
];

const PULSE_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '完成 JavaScript 与 TypeScript 基础，能够区分页面、接口和后台任务，并能记录运营流程与异常状态。',
    goal: '能把内容运营、数据分析师、值班编辑和系统管理员的驾驶舱任务分开，明确热点发现、证据查看、来源健康和告警接管四条路径，并写出 Pulse 首版不承担的分析与采集边界。',
    guidedPractice: '模拟运营在一次突发事件中查看热点、打开证据、筛选来源并接管告警，再让管理员检查来源积压；记录每个角色需要的首个数字、上下文证据、可执行动作和失败代价。',
    independentPractice: '交付四张角色任务卡、一张热点到证据再到告警的主流程图，以及一张来源中断、事件重复、数据过期和无权限的异常流程图。',
    commonErrors: [
      '只描述“做一个实时大屏”，没有说明运营看到数字后要做什么动作，也没有定义事件证据和来源。',
      '把全部角色塞进同一个权限视图，普通编辑能修改采集配置，审计员却看不到关键操作记录。',
    ],
    sourceRefs: [
      'Next.js App Router Documentation. https://nextjs.org/docs/app',
      'WHATWG Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html',
      'Nielsen Norman Group: Task Analysis. https://www.nngroup.com/articles/task-analysis/',
    ],
    steps: [
      [
        '先识别运营决策的触发条件',
        '内容运营通常在热点突然上升、来源失真或告警堆积时打开 Pulse；数据分析师关注趋势与对比，值班编辑需要在有限时间内接管告警，管理员关注采集健康和容量。任务卡要写触发事件、首先看到什么、下一步动作和无法判断时的替代流程。',
        '实时页面首先服务决策而非展示数据',
      ],
      [
        '热点、证据和动作必须同屏关联',
        '热点卡片不能只有分值，还要显示时间窗口、来源数量、代表性事件和最近告警；打开热点后能沿着 cursor 查看事件时间线，并回到来源健康。运营的完成标准是“能解释热度为何变化并决定是否接管”，不是“页面出现了图表”。',
        '数字必须能追溯到证据',
      ],
      [
        '来源健康与采集积压分开表达',
        '来源健康描述采集是否在线、最近成功时间和错误率，积压描述尚未处理的事件数量与最老事件年龄；两者同时恶化时，先阻止错误数据扩散，再处理容量。管理员任务要能暂停单个来源、重试失败批次并查看操作影响。',
        '健康、延迟和积压是三个状态',
        {
          title: '把运营任务按紧急度与影响排序',
          language: 'javascript',
          code: `const tasks = [
  { actor: '值班编辑', task: '接管来源中断告警', severity: 5, impact: 5 },
  { actor: '内容运营', task: '打开热点证据', severity: 3, impact: 4 },
  { actor: '数据分析师', task: '比较两个来源趋势', severity: 2, impact: 3 },
  { actor: '系统管理员', task: '查看采集积压', severity: 4, impact: 5 },
];

const ordered = [...tasks].sort((a, b) =>
  (b.severity * 2 + b.impact) - (a.severity * 2 + a.impact));
for (const item of ordered) {
  console.log(item.actor + ' | ' + item.task + ' | score=' + (item.severity * 2 + item.impact));
}`,
          output: `值班编辑 | 接管来源中断告警 | score=15
系统管理员 | 查看采集积压 | score=13
内容运营 | 打开热点证据 | score=10
数据分析师 | 比较两个来源趋势 | score=7`,
        },
      ],
      [
        '权限按可执行动作设计',
        '运营可以筛选热点和查看证据，值班编辑可以接管或关闭告警，管理员才能修改来源和容量阈值，审计员读取配置变更记录。权限不能只隐藏按钮，API 必须在对象级别检查来源、租户和动作。',
        '隐藏按钮不等于授权',
      ],
      [
        '把非目标写进产品边界',
        'Pulse 首版不做全网舆情采集、复杂推荐算法和移动原生 App，只接入预先定义的内容来源与事件流；热点分值是运营辅助信号，不是事实结论。阶段结束前用第三人复述每个角色的任务、证据和失败恢复路径。',
        '先限制数据范围再谈实时',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已有 Pulse 角色任务卡和主流程，能读懂 HTTP 请求、SSE 事件和浏览器性能指标。',
    goal: '能把 Pulse 首版收敛为来源列表、事件时间线、热度卡片、实时流和基础筛选，写出首屏、首事件、断线恢复和慢消费者预算，并让每条验收都有可观察证据。',
    guidedPractice: '把原始“大屏看全网热点”拆成必须有、以后再做、明确不做三列；分别写首次加载、打开事件、SSE 断开三秒后恢复、来源无权限和慢客户端积压的验收场景。',
    independentPractice: '交付一页范围表、一张失败场景矩阵和一份指标口径说明，要求每个指标说明测量入口、采样窗口、通过线和不通过时的处理动作。',
    commonErrors: [
      '把“实时”写成没有时间窗口的目标，导致首屏、流式首事件和后台刷新混为一谈。',
      '只测桌面大屏，不定义窄屏、屏幕阅读器、慢客户端和来源无权限时的体验。',
    ],
    sourceRefs: [
      'web.dev Core Web Vitals. https://web.dev/articles/vitals',
      'web.dev Interaction to Next Paint. https://web.dev/articles/inp',
      'WHATWG HTML Living Standard: Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html',
    ],
    steps: [
      [
        'MVP 只保留一条完整观察链路',
        '首版页面固定为来源列表、事件时间线、热度卡片、实时流和基础筛选，允许运营从热点进入证据并标记告警接管；复杂推荐、全网采集和原生 App 不进入首版。每个页面都要对应资源与权限，不临时增加无数据来源的仪表盘。',
        '先做通一条链路再加视图',
      ],
      [
        '验收语句包含时间和失败条件',
        '把“实时显示”改写成“连接建立后一秒内出现首条事件，断开后三秒内自动重连并从最后 cursor 补回缺失事件”；把“来源健康”改写成“最近成功时间超过五分钟时显示 stale 和告警入口”。',
        '实时指标必须带窗口和起点',
      ],
      [
        '预算覆盖首屏与实时流两个时间轴',
        '首屏 LCP 小于 2.5 秒，服务端首屏不等待实时流；首个 SSE 事件目标小于一秒，事件插入后的交互延迟用 INP 观察。慢消费者不能在服务端无限缓存，超过待发送上限时应记录并断开，客户端通过 cursor 恢复。',
        '首屏预算与流式预算分开测量',
      ],
      [
        '可访问性覆盖图表和实时更新',
        '热度趋势必须有文字摘要、表格或可读时间线替代，颜色不能是唯一状态；实时插入使用受控 aria-live，不能每条事件都打断屏幕阅读器。窄屏可将并排面板改为可切换区域，但筛选和告警动作仍可到达。',
        '实时更新不能制造朗读风暴',
      ],
      [
        '指标口径写进发布门禁',
        '为每个指标记录采样入口：LCP 来自浏览器，首事件来自服务端和客户端时间差，断线恢复看重连日志，慢消费者看待发送队列和断开数量。没有证据的指标不能写“符合预期”，也不能用开发环境日志代替生产观察。',
        '每项实时指标都要有采样入口',
        {
          title: '把 Pulse 的实时验收写成可执行门禁',
          language: 'javascript',
          code: `const contracts = [
  { name: 'LCP', observed: 2.2, budget: 2.5, unit: 's' },
  { name: 'first-event', observed: 720, budget: 1000, unit: 'ms' },
  { name: 'reconnect', observed: 1800, budget: 3000, unit: 'ms' },
  { name: 'slow-client-drop', observed: 0, budget: 0, unit: 'count' },
];

for (const item of contracts) {
  const passed = item.observed <= item.budget;
  console.log(item.name + '=' + item.observed + item.unit +
    ' budget=' + item.budget + item.unit + ' ' + (passed ? 'PASS' : 'FAIL'));
}`,
          output: `LCP=2.2s budget=2.5s PASS
first-event=720ms budget=1000ms PASS
reconnect=1800ms budget=3000ms PASS
slow-client-drop=0count budget=0count PASS`,
        },
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解 HTTP、JSON、分页游标和 SSE 基本帧格式，能写出资源字段与请求响应示例。',
    goal: '能定义 sources、events、alerts、stream 和 cursor 分页契约，区分 RSC 首屏数据、客户端筛选状态和实时流状态，并让前端在断线、重复事件和无权限时得到稳定错误。',
    guidedPractice: '为四个资源写请求方法、查询参数、响应结构、错误码和权限条件，再用 curl 或 fetch 构造一次 cursor 分页、一次 403、一次重复事件和一次断线重连。',
    independentPractice: '交付 OpenAPI 或等价契约、三个示例响应、一份前端状态矩阵，以及一套契约测试，覆盖事件去重、cursor 过期、来源禁用和流式鉴权失败。',
    commonErrors: [
      '把 SSE 当普通 fetch 响应，忽略事件 id、event 名称、空行分隔和 Last-Event-ID 恢复语义。',
      '用 offset 分页承载不断插入的实时事件，导致刷新后重复、漏读或时间线跳动。',
    ],
    sourceRefs: [
      'WHATWG Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html',
      'OpenAPI Specification. https://spec.openapis.org/oas/latest.html',
      'Next.js Data Fetching. https://nextjs.org/docs/app/building-your-application/data-fetching',
    ],
    steps: [
      [
        '资源按观察对象拆分',
        'source 描述采集来源和健康，event 描述时间线事件与证据，topic 描述热点聚合，alert 描述需要操作的告警，stream 只负责按 cursor 发送变化。不要把来源配置、热度和告警都塞进一个 dashboard 响应。',
        '一个资源只承担一个观察对象',
      ],
      [
        'cursor 与 Last-Event-ID 共同表达恢复点',
        '列表查询使用不透明 cursor，事件流使用 SSE id 为客户端提供 Last-Event-ID；服务端只保留有限回放窗口，游标过期返回 410 和可重新加载的 cursor。客户端不能把时间戳字符串当稳定 cursor。',
        'cursor 必须服务去重和回放',
      ],
      [
        'SSE 帧要能独立解析',
        'SSE 以空行分隔帧，event、id、data 和 retry 字段各自有语义；data 可以是多行 JSON。服务端发送事件后保持连接，并通过注释心跳维持代理层连接；客户端必须在收到 id 后用于下一次重连。',
        'event、id、data 不能混成一个字符串',
      ],
      [
        '错误区分刷新、重试和重新认证',
        '401 需要重新登录，403 表示当前用户无权读取该来源或操作告警，404 可表示对象被删除，410 表示 cursor 过期，503 可短暂重试；错误结构至少包含 code、message、retryAfterMs 和 requestId。前端根据 code 选择恢复动作，不解析自然语言。',
        '错误码决定恢复策略',
        {
          title: '解析一条 Pulse SSE 事件',
          language: 'javascript',
          code: `const wire = 'id: 42\\nevent: topic.updated\\ndata: {"topicId":"ai-capital","score":81,"sourceCount":7}\\n\\n';
const [header, data] = wire.trim().split('\\ndata: ');
const fields = Object.fromEntries(header.split('\\n').map((line) => {
  const index = line.indexOf(': ');
  return [line.slice(0, index), line.slice(index + 2)];
}));
const payload = JSON.parse(data);

console.log('event=' + fields.event);
console.log('id=' + fields.id);
console.log('topic=' + payload.topicId);
console.log('score=' + payload.score);`,
          output: `event=topic.updated
id=42
topic=ai-capital
score=81`,
        },
      ],
      [
        '前端状态边界围绕服务端与客户端职责',
        'RSC 或服务端首屏只获取初始 sources、events 和权限快照，客户端负责筛选、实时插入、断线状态和处理用户动作；客户端缓存键包含租户、查看用户和筛选条件。任何乐观插入都必须带稳定 event id，服务端确认后才能去重提交。',
        '服务端首屏与客户端流式状态分开',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 Pulse 资源契约，掌握 SQL 主键、唯一约束、索引和基本事务。',
    goal: '能为 source、event、topic、alert 和 stream cursor 设计去重键、时间窗口与索引，保证重复采集不产生重复事件，并写出游标过期、事件补回和历史表迁移方案。',
    guidedPractice: '在本地 PostgreSQL 建 source 与 event 表，使用 source_id 加 external_id 的唯一约束写入同一事件两次，再用 time_bucket 或时间范围查询生成热度样本；最后用 EXPLAIN 检查来源时间线查询。',
    independentPractice: '交付 ER 图、DDL、迁移和回填脚本、重复事件实验、来源禁用后的查询语义说明，以及一次 checkpoint 或分区索引的验证记录。',
    commonErrors: [
      '只用自增 id 标识事件，来源重复投递时会生成多条相同证据并污染热度。',
      '为所有查询都建索引，忽略写入高频事件带来的维护成本和索引选择。',
    ],
    sourceRefs: [
      'PostgreSQL Constraints. https://www.postgresql.org/docs/current/ddl-constraints.html',
      'PostgreSQL Indexes. https://www.postgresql.org/docs/current/indexes.html',
      'Redis Documentation: Expire. https://redis.io/docs/latest/commands/expire/',
    ],
    steps: [
      [
        '事件身份由来源与外部标识组成',
        'event 至少包含 source_id、external_id、occurred_at、received_at、title、evidence_url 和 payload_version；source_id 加 external_id 构成来源侧幂等键，数据库内再保留主键。topic 聚合与 alert 只引用事件 id，不复制证据正文。',
        '外部标识是采集去重的核心',
      ],
      [
        '热度查询需要时间范围与来源过滤',
        '来源时间线按 source_id 和 occurred_at 倒序索引，窗口聚合按 occurred_at 范围扫描；topic 热度是窗口内事件数量、来源权重和告警状态的派生结果，不能把每次计算结果永久写入事件行。',
        '先写查询计划再建复合索引',
      ],
      [
        '事件流与历史列表采用不同保留策略',
        '高频事件表可按月分区或归档，SSE 回放只保留最近一段时间；列表查询可读历史分区，cursor 指向事件 id 加时间或专用 checkpoint。过期 cursor 返回 410，不允许静默从头开始导致重复插入。',
        '回放窗口和历史窗口不是同一预算',
      ],
      [
        '迁移先补唯一键再切换写入',
        '已有重复数据时先清洗并记录冲突组，新增 external_id 列并回填，再建唯一索引；旧采集器仍可能发送无 external_id 的请求，需在过渡期派生临时键并打标记。删除旧列或改主键前保留回滚路径。',
        '唯一约束建立前先清理冲突数据',
        {
          title: '用唯一约束阻止重复事件',
          language: 'sql',
          code: `CREATE TABLE source (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE event (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES source(id),
  external_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  title TEXT NOT NULL,
  UNIQUE (source_id, external_id)
);

INSERT INTO source (id, name, enabled) VALUES (1, 'industry-feed', 1);
INSERT INTO event (id, source_id, external_id, occurred_at, title)
VALUES (1, 1, 'feed-9001', '2026-11-23T08:00:00Z', '模型发布');
INSERT OR IGNORE INTO event (id, source_id, external_id, occurred_at, title)
VALUES (2, 1, 'feed-9001', '2026-11-23T08:00:00Z', '重复投递');

SELECT COUNT(*) AS events FROM event;
SELECT changes() AS duplicate_inserted;`,
          output: `events
1
duplicate_inserted
0`,
        },
      ],
      [
        '缓存必须可失效且不能替代事实源',
        'Redis 只保存热度快照、来源健康摘要和短时 cursor 状态，TTL 与事件窗口保持一致；缓存失效时从 PostgreSQL 重算，不能把缓存值当成永久历史。缓存键包含租户、来源集合和时间窗口，禁用来源后主动删除相关键。',
        '缓存是加速层而不是账本',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '能使用 Node.js、pnpm、Python 虚拟环境与 Docker Compose，理解 Next.js 与 FastAPI 的基本启动方式。',
    goal: '能从空目录建立 Pulse 的 Next.js 前端、FastAPI 事件服务、PostgreSQL、Redis 与 SSE 通道骨架，划清 RSC、客户端、BFF、事件服务和数据存储的依赖方向。',
    guidedPractice: '创建 apps/pulse-web、services/events、packages/contracts 与 infra；先让 Next 首页读取固定 source 数据，再启动 FastAPI 健康检查，最后用 Compose 启动 PostgreSQL 和 Redis 并记录端口。',
    independentPractice: '交付可运行工程、依赖图、README、环境变量样例、健康检查脚本和一条从网页首屏到 FastAPI 的请求追踪记录。',
    commonErrors: [
      '把数据库密码和模型密钥写进前端环境变量，Next 构建后公开了本应只在服务端使用的秘密。',
      '前端、FastAPI 和数据库各自定义不同的事件字段，联调时靠手工改名，契约很快漂移。',
    ],
    sourceRefs: [
      'Next.js Project Structure. https://nextjs.org/docs/app/getting-started/project-structure',
      'FastAPI Documentation. https://fastapi.tiangolo.com/',
      'Docker Compose Documentation. https://docs.docker.com/compose/',
    ],
    steps: [
      [
        '目录按运行边界拆分',
        'apps/pulse-web 负责 RSC 首屏和客户端交互，services/events 负责查询、缓存和 SSE，packages/contracts 存放共享类型与 schema，infra 存放 Compose 与监控配置。运行单元不同，不应为了共享文件把所有代码塞进一个目录。',
        '目录边界对应部署边界',
      ],
      [
        'RSC 与客户端组件只共享序列化数据',
        '服务端组件读取 source 与 event 摘要，直接传给客户端筛选器；函数、数据库连接和 private 环境变量不能跨边界传递。实时事件通过明确 API 进入客户端状态，避免把整个服务端缓存对象序列化到浏览器。',
        '连接对象不能跨 RSC 边界',
      ],
      [
        'FastAPI 先暴露健康与资源契约',
        '服务启动后先验证 /healthz、/sources 和 /events 三个端点，再接入 SSE；健康检查只证明进程能响应，不证明数据库或 Redis 可用，因此需要区分 liveness、readiness 和依赖状态。',
        '进程存活不等于依赖健康',
      ],
      [
        '本地依赖通过固定版本和端口启动',
        'Compose 固定 PostgreSQL、Redis 和可选观测组件版本，端口与环境变量写入 .env.example，真实秘密不提交。Next、FastAPI 和 Compose 的启动顺序写进 README，并提供一键 smoke 脚本。',
        '本地依赖也必须可复现',
        {
          title: '创建 Pulse 前端与事件服务骨架',
          language: 'bash',
          code: `pnpm create next-app@latest apps/pulse-web --ts --app --src-dir --use-pnpm
mkdir -p services/events packages/contracts infra
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn
uvicorn services.events.main:app --reload --port 8000`,
          output: `apps/pulse-web created
services/events created
packages/contracts created
infra created
Uvicorn running on http://127.0.0.1:8000`,
        },
      ],
      [
        '用一次端到端请求验证骨架',
        '打开 Next 首页，确认页面通过服务端读取至少一个 source；再点击筛选触发客户端请求，Network 中应看到同源 BFF 或 FastAPI 请求，并在响应头或日志里出现 requestId。阶段结束前从干净终端重新安装与启动一次。',
        '骨架完成的标准是一条请求能追踪到底',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Pulse 工程骨架已可运行，理解异步请求、Redis 缓存、SSE 生命周期和基本事件去重。',
    goal: '能实现从来源查询、事件去重、热度缓存到 SSE 发送的后端链路，并证明心跳、慢消费者、断线重连和越权订阅都有可观察行为。',
    guidedPractice: '先写只发送单条事件的 SSE 端点，再加入 event id、心跳和有界队列；用两条重复事件验证去重，用一个故意不读取的客户端验证服务端不会无限增长。',
    independentPractice: '交付一个可运行事件服务、重复与慢消费者实验日志、重连恢复说明和权限测试，证明客户端断开后能从明确 cursor 继续而不是重新从头插入。',
    commonErrors: [
      '在 SSE 循环里无限 await 网络写入，慢客户端让单个连接占满内存且拖住其他连接。',
      '事件重复投递时只在前端去重，服务端和缓存已重复计算，热度因此被放大。',
    ],
    sourceRefs: [
      'FastAPI StreamingResponse. https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse',
      'WHATWG Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html',
      'Redis Streams Documentation. https://redis.io/docs/latest/develop/data-types/streams/',
    ],
    steps: [
      [
        '查询、缓存和流式发送分层',
        '事件服务先从 PostgreSQL 读取事实，再用 Redis 保存短时热度摘要和游标状态；SSE 端点只负责按 cursor 读取并发送已序列化事件。把数据库查询和网络写入拆开，才能分别设置超时、重试和指标。',
        '事实源与流式通道分开',
      ],
      [
        '去重发生在进入聚合之前',
        'source_id 与 external_id 的唯一约束拒绝重复事件，应用层捕获唯一冲突后返回 duplicate 结果；只有新事件才增加窗口计数并失效热度缓存，避免前端去重掩盖后台数据污染。',
        '先在写入边界去重',
      ],
      [
        'SSE 生命周期包含鉴权、心跳和关闭',
        '建立连接时先校验用户租户、来源集合和订阅权限，发送初始 retry 与心跳；客户端断开、服务端取消或权限撤销时及时释放队列和数据库游标。每个事件包含 id 与 event 名称，客户端用 Last-Event-ID 恢复。',
        '连接建立和取消都必须有清理路径',
      ],
      [
        '有界队列保护慢消费者',
        '每个连接只允许有限待发送事件，队列满时记录 consumer_id、积压数和最后 cursor，然后发送 lag 警告并断开；客户端重连后从最后确认 cursor 补回。不能为了“实时”把所有事件永久保存在服务进程内存。',
        '慢连接必须有明确断开阈值',
        {
          title: '模拟 Pulse 事件去重与有界发送队列',
          language: 'python',
          code: `from collections import deque

seen = set()
queue = deque(maxlen=2)
incoming = [
    ("feed-9001", "模型发布"),
    ("feed-9001", "模型发布"),
    ("feed-9002", "框架更新"),
    ("feed-9003", "融资消息"),
    ("feed-9004", "安全公告"),
]

for event_id, title in incoming:
    if event_id in seen:
        print("duplicate=" + event_id)
        continue
    seen.add(event_id)
    if len(queue) == queue.maxlen:
        dropped = queue.popleft()
        print("drop=" + dropped[1])
    queue.append((event_id, title))
    print("send=" + title)

print("pending=" + str(len(queue)))`,
          output: `send=模型发布
duplicate=feed-9001
send=框架更新
send=融资消息
drop=模型发布
send=安全公告
drop=框架更新
pending=2`,
        },
      ],
      [
        '错误与指标围绕恢复动作设计',
        '数据库超时返回可重试状态并记录 requestId，缓存故障允许回源但限制并发，游标过期返回 410，权限撤销返回 403 并关闭连接。记录连接数、首事件延迟、队列深度、断开数和重连成功率，指标标签不能含用户原文。',
        '每个错误都要对应下一步动作',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Pulse 后端已能返回来源、事件和 SSE 流，理解 React 服务端组件、客户端组件和可访问图表替代文本。',
    goal: '能实现服务端首屏、客户端筛选与实时插入，覆盖连接中、空数据、错误、无权限、断线重连和窄屏布局，并让图表、告警和事件时间线可用键盘和屏幕阅读器理解。',
    guidedPractice: '先渲染静态来源与事件，再接入 EventSource 或 fetch stream；为每个状态写可见提示，最后在桌面和 320px 窄屏走查筛选、打开事件、接管告警和断线恢复。',
    independentPractice: '交付驾驶舱页面、状态矩阵截图、键盘走查记录、图表文字摘要和无障碍自动化报告，要求实时插入不打断用户当前阅读。',
    commonErrors: [
      '把 EventSource 放在服务端组件里，试图在 RSC 渲染期间维持浏览器连接。',
      '每条实时事件都触发 aria-live 播报，屏幕阅读器被高频更新淹没，用户无法继续操作。',
    ],
    sourceRefs: [
      'React Server Components. https://react.dev/reference/rsc/server-components',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
      'Next.js Client Components. https://nextjs.org/docs/app/getting-started/server-and-client-components',
    ],
    steps: [
      [
        '首屏由服务端提供稳定上下文',
        '服务端组件读取来源列表、权限和最近事件摘要，把可序列化字段交给客户端；首屏不等待实时流建立，先显示已有快照和“正在连接”状态。数据库连接、秘密和 SSE 客户端入口不能跨到客户端包。',
        '首屏先可用，再实时增强',
      ],
      [
        '客户端筛选保留 URL 和当前选择',
        '来源、事件类型与时间范围写入查询参数，刷新后恢复；切换筛选时取消旧请求并显示上次结果与加载状态，避免旧响应覆盖新条件。实时插入只作用于当前筛选，用户打开详情时不自动滚动。',
        '筛选请求必须可取消和可恢复',
      ],
      [
        '实时插入按 event id 去重',
        '客户端维护已见 event id 的有界集合，收到 SSE 事件后更新列表和热度摘要，不从零重建整个页面；断线后显示最后更新时间并从 Last-Event-ID 恢复。超过回放窗口时提供重新载入按钮。',
        '实时更新要有稳定身份',
      ],
      [
        '图表提供文本与表格替代',
        '趋势图旁提供当前窗口、最高点、变化幅度和来源数量摘要，详情页可用表格查看同一数据；颜色不能单独表示告警级别，状态文本和形状同时存在。时间线使用有序列表和可读时间。',
        '图表信息必须存在非视觉等价物',
        {
          title: '渲染一张带可访问名称的 Pulse 热点摘要',
          language: 'tsx',
          code: `import { renderToStaticMarkup } from 'react-dom/server';

type Topic = { name: string; score: number; sources: number; status: string };

function TopicRow({ topic }: { topic: Topic }) {
  return (
    <table>
      <caption>热点摘要</caption>
      <thead><tr><th>主题</th><th>温度</th><th>来源</th><th>状态</th></tr></thead>
      <tbody>
        <tr>
          <td>{topic.name}</td>
          <td>{topic.score}</td>
          <td>{topic.sources}</td>
          <td>{topic.status}</td>
        </tr>
      </tbody>
    </table>
  );
}

console.log(renderToStaticMarkup(
  <TopicRow topic={{ name: 'AI 资本支出', score: 81, sources: 7, status: '上升' }} />,
));`,
          output: `<table><caption>热点摘要</caption><thead><tr><th>主题</th><th>温度</th><th>来源</th><th>状态</th></tr></thead><tbody><tr><td>AI 资本支出</td><td>81</td><td>7</td><td>上升</td></tr></tbody></table>`,
        },
      ],
      [
        '窄屏与键盘路径必须能完成任务',
        '窄屏把来源、时间线和告警布局改为可切换面板，切换后焦点仍可预期；告警接管使用真实按钮，打开详情后提供返回路径。实时更新不得抢走焦点，reduced-motion 下关闭滚动与大幅动画。',
        '移动端不是压缩桌面表格',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'Pulse 前后端已接入 SSE，能运行单元测试、契约测试与浏览器自动化，并查看 Redis 和数据库日志。',
    goal: '能验证契约兼容、租户权限、SSE 中断恢复、慢消费者和首屏性能，形成可复现的失败注入记录，而不是只测一次正常实时更新。',
    guidedPractice: '让事件服务分别返回重复事件、403、503、错误 cursor 和延迟事件，观察前端状态与服务端指标；再限制客户端读取速度，确认连接被断开且能从 cursor 恢复。',
    independentPractice: '交付测试报告，覆盖契约、重连、慢客户端、来源权限和首屏性能；记录一次失败如何定位到服务端队列、缓存或前端去重层。',
    commonErrors: [
      '测试只在同一条 SSE 连接上等待成功事件，没有验证断线、重启和 Last-Event-ID 恢复。',
      '只检查页面是否显示数据，不验证跨租户来源和事件是否被 API 拒绝。',
    ],
    sourceRefs: [
      'WHATWG Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html',
      'Playwright Network Interception. https://playwright.dev/docs/network',
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
    ],
    steps: [
      [
        '契约测试固定字段与错误码',
        '对 sources、events、alerts 和 stream 各保存一份成功与失败样例，检查新增字段不会破坏客户端，删除字段或改变枚举会被发现。SSE 测试要解析 id、event、data 和空行边界，不把原始字符串当唯一断言。',
        '契约测试覆盖向前兼容',
      ],
      [
        '权限测试必须跨租户和跨来源',
        '创建两个租户、两个来源和不同角色，验证用户读取来源、事件、告警和建立流时都经过对象级检查；撤销来源权限后，已建立连接应被关闭或下一事件被拒绝，不能只依赖前端隐藏。',
        '实时连接也要持续授权',
      ],
      [
        '断线与重启按恢复点验收',
        '关闭浏览器连接或重启事件服务，三秒内重连并从 Last-Event-ID 补回；重复事件必须被去重，过期 cursor 必须显示可重新加载状态。记录重连次数、缺失事件数量和服务端最后发送位置。',
        '恢复结果要比连接状态更重要',
      ],
      [
        '慢消费者需要主动保护服务',
        '在测试客户端暂停读取，服务端队列达到上限后记录并断开，同时继续服务正常客户端。恢复时使用最后收到的事件 id，检查列表无重复和断层；若只在前端关闭 EventSource 而服务端仍缓存，实验无效。',
        '保护服务端内存优先于保持单条连接',
        {
          title: '模拟慢消费者触发有界队列断开',
          language: 'javascript',
          code: `const consumers = [
  { id: 'editor-1', pending: 0, maxPending: 2, active: true },
  { id: 'dashboard-2', pending: 0, maxPending: 2, active: true },
];
const events = [101, 102, 103, 104, 105, 106];

for (const eventId of events) {
  for (const consumer of consumers) {
    if (!consumer.active) continue;
    if (consumer.pending >= consumer.maxPending) {
      consumer.active = false;
      console.log('disconnect=' + consumer.id + ' last=event-' + (eventId - 1));
      continue;
    }
    consumer.pending += 1;
    if (consumer.id === 'dashboard-2') consumer.pending = 0;
  }
}
console.log('active=' + consumers.filter((item) => item.active).map((item) => item.id).join(','));`,
          output: `disconnect=editor-1 last=event-102
active=dashboard-2`,
        },
      ],
      [
        '性能与安全结论必须有证据',
        '记录生产构建的 LCP、首事件延迟和内存曲线，查看慢请求与连接数；检查日志是否含用户邮箱、来源密钥和完整事件正文。测试报告按场景列出通过、失败、恢复动作和残留风险，不能只贴一张流水线绿色截图。',
        '性能和安全都按真实请求链路验收',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'Pulse 前端、事件服务与数据依赖已能本地联调，理解容器、健康检查、Trace 和基础发布策略。',
    goal: '能把 Next、FastAPI、PostgreSQL 和 Redis 组合成可发布制品，配置探针、迁移、Trace、指标和冒烟流程，并写清 SSE 连接排空与版本回滚策略。',
    guidedPractice: '用 Compose 启动 web、event、postgres 和 redis，分别验证 readiness、数据库迁移、SSE 首个事件和慢消费者指标；再构建带固定标签的镜像并执行一次预览发布。',
    independentPractice: '交付 Compose 或部署清单、CI 配置、探针说明、发布顺序表、回滚手册和一次从事件服务故障中恢复的记录。',
    commonErrors: [
      '只给 Web 进程配置健康检查，事件服务连接 Redis 或数据库失败后仍被标记为健康。',
      '发布事件服务时直接终止旧连接，没有排空或重连策略，用户看到长时间断线且 cursor 丢失。',
    ],
    sourceRefs: [
      'Docker Compose Documentation. https://docs.docker.com/compose/',
      'Kubernetes Documentation: Pod Lifecycle. https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '每个运行单元使用独立镜像或构建产物',
        'Next 与 FastAPI 分别构建、打版本标签并记录提交；数据库和 Redis 使用固定版本，迁移作为显式步骤运行，不把开发依赖和秘密写入镜像层。',
        '制品身份要能追溯到提交',
      ],
      [
        'ready 与 live 分开表达依赖状态',
        'liveness 只检查事件进程能否继续运行，readiness 检查数据库和 Redis 是否可访问、迁移是否完成、必要队列是否可写；SSE 连接建立后再检查用户权限。探针失败不能无限重启一个正在等待依赖的服务。',
        '存活与可接收流量不是一回事',
      ],
      [
        '可观测性沿一次事件追踪',
        '为来源查询、去重写入、缓存刷新、SSE 发送和客户端重连生成关联 requestId 或 traceId；记录连接数、首事件延迟、待发送队列深度、断开原因和重连成功率，避免泄露用户内容。',
        '一条事件要能跨服务追踪',
      ],
      [
        '发布时先兼容契约再排空连接',
        '部署顺序先迁移兼容数据库、再滚动发布事件服务，最后发布前端；旧实例停止接新连接后允许有限时间排空，客户端收到重连提示并从 Last-Event-ID 恢复。发布期间禁止删除旧事件字段。',
        '发布顺序必须同时兼容新旧连接',
        {
          title: '定义 Pulse 发布依赖与健康检查',
          language: 'yaml',
          code: `services:
  web:
    image: pulse-web:r18
    ports: ["3000:3000"]
    depends_on: [events]
  events:
    image: pulse-events:r18
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://pulse:pulse@postgres:5432/pulse
      REDIS_URL: redis://redis:6379
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
    depends_on: [postgres, redis]
  postgres:
    image: postgres:16.4
    environment:
      POSTGRES_USER: pulse
      POSTGRES_PASSWORD: local-only
      POSTGRES_DB: pulse
  redis:
    image: redis:7.4

networks:
  default:
    name: pulse-local`,
          output: `docker compose config --services
web
events
postgres
redis
docker compose up -d
events readiness=database:ok,redis:ok
web smoke=200
stream first-event=640ms`,
        },
      ],
      [
        '回滚覆盖代码、契约和缓存',
        '确认上一版镜像、数据库迁移兼容性、Redis 键格式和 Last-Event-ID 语义后再回滚；回滚后验证首屏、SSE、断线恢复和告警接管。若旧版本无法读取新 cursor，必须明确迁移或清空策略，不能直接切换。',
        '回滚不是只换镜像标签',
      ],
    ],
  },
  {
    name: '综合训练 · Pulse 实时驾驶舱 · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'Pulse 已完成本地发布和基本观测，能查看服务日志、Redis 指标、数据库连接与浏览器 Network。',
    goal: '能演练来源中断、Redis 故障、SSE 连接泄洪和错误版本发布，按影响范围决定降级、暂停或回滚，并用运行图和证据完成项目答辩。',
    guidedPractice: '逐次让一个来源停止更新、删除 Redis 热度键、制造大量短连接并回滚事件服务版本；每次只注入一个故障，记录首个异常、用户可见表现、告警触发和恢复时间。',
    independentPractice: '交付故障演练报告、恢复脚本、运行手册、一张实时链路图和十分钟答辩提纲，明确哪些失败会降级、哪些必须停止发布。',
    commonErrors: [
      'Redis 故障时事件服务直接整体返回 500，没有从 PostgreSQL 读取已有事实或限制流量。',
      '告警和日志只记录“连接失败”，没有来源、租户、连接数、最后 cursor 和版本信息，无法定位。',
    ],
    sourceRefs: [
      'Google SRE Workbook. https://sre.google/workbook/table-of-contents/',
      'Redis Documentation: High Availability. https://redis.io/docs/latest/operate/oss_and_stack/management/replication/',
      'OpenTelemetry Documentation. https://opentelemetry.io/docs/',
    ],
    steps: [
      [
        '来源中断先验证陈旧数据边界',
        '停止一个来源的投递，确认来源健康在预期窗口变为 stale，热度不会把旧事件当成新事件继续放大；运营应看到最后成功时间和继续使用旧证据的风险提示。恢复后从来源 cursor 补回并记录缺失窗口。',
        '来源健康要反映最后有效事件',
      ],
      [
        'Redis 故障走有界回源',
        '删除热度缓存或让 Redis 不可用，事件服务应返回数据库可计算的旧快照或明确降级状态，同时限制回源并发。不能把无限重试压到数据库，也不能让整个驾驶舱失去基本读取能力。',
        '缓存失效不等于事实源失效',
      ],
      [
        '连接泄洪通过准入与心跳保护',
        '制造大量短连接和慢连接，观察连接上限、单 IP/租户配额、心跳失败和队列深度；超过阈值时拒绝新连接并给 retry-after，不要让进程因对象和缓冲区耗尽。',
        '连接准入与心跳共同限制资源占用',
        {
          title: '模拟 Pulse 在 Redis 故障时安全降级',
          language: 'python',
          code: `def load_hotspots(cache_ok, cache_value, database_rows, limit=2):
    if cache_ok and cache_value:
        return {"mode": "cache", "topics": cache_value[:limit]}
    return {"mode": "database-fallback", "topics": database_rows[:limit]}


rows = [
    {"topic": "AI 资本支出", "score": 81},
    {"topic": "芯片交付", "score": 63},
]

print(load_hotspots(True, rows, rows))
print(load_hotspots(False, [], rows))`,
          output: `{'mode': 'cache', 'topics': [{'topic': 'AI 资本支出', 'score': 81}, {'topic': '芯片交付', 'score': 63}]}
{'mode': 'database-fallback', 'topics': [{'topic': 'AI 资本支出', 'score': 81}, {'topic': '芯片交付', 'score': 63}]}`,
        },
      ],
      [
        '版本回滚要处理连接与 cursor',
        '坏版本导致事件重复或连接无法恢复时，先停止新流量、保存最后事件 id 和版本信息，再切回上一版事件服务；旧实例排空后客户端从 Last-Event-ID 重连。回滚完成必须比对事件总数、热门主题和告警状态。',
        '回滚后要核对数据是否连续',
      ],
      [
        '答辩用运行图解释边界',
        '答辩按用户任务、数据流、RSC 与客户端边界、SSE 恢复、慢消费者保护、发布门禁和两次事故取舍展开。说明一个未做的推荐功能、一个被否决的无限缓存方案，以及下一阶段如何提高来源质量和连接容量。',
        '运行图要能解释故障发生在哪里',
      ],
    ],
  },
];

const TEAMFLOW_COURSES: readonly ProgrammingCourseSeed[] = [
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 业务理解与用户任务',
    track,
    contentStatus: 'reviewed',
    minutes: 42,
    prerequisite: '掌握 Java、SQL、HTTP 和 Vue/TypeScript 基础，能区分租户、用户、角色和对象权限。',
    goal: '能把工作区管理员、项目负责人、普通成员和审计员的入职邀请、项目创建、任务分配、评论通知与审计任务拆开，明确多租户系统的边界、可见数据和失败恢复。',
    guidedPractice: '模拟管理员创建第二个工作区并邀请成员、负责人建立项目并分配任务、成员完成任务触发通知、审计员查看操作记录；记录每个动作的租户上下文、角色、对象归属和失败提示。',
    independentPractice: '交付四张角色任务卡、一张工作区到任务通知的流程图、一张跨租户访问与撤权异常图，以及首版非目标清单。',
    commonErrors: [
      '把租户当成普通筛选条件，没有把 tenant_id 作为所有查询、缓存和消息的强制边界。',
      '只设计管理员视角，遗漏普通成员只能更新自己任务、审计员只读等对象级规则。',
    ],
    sourceRefs: [
      'Spring Security Reference. https://docs.spring.io/spring-security/reference/',
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'Vue.js Documentation. https://vuejs.org/guide/',
    ],
    steps: [
      [
        '先描述组织与成员生命周期',
        '工作区管理员创建工作区、邀请成员、设置角色并决定谁能创建项目；成员可能同时在多个工作区，但每个工作区有独立角色和数据。邀请需要过期、撤销和重复接受处理，成员离开后历史审计仍保留，任务归属需要转移。',
        '成员关系属于工作区而不是用户资料',
      ],
      [
        '项目任务是最小协作闭环',
        '负责人创建项目、添加任务并分配成员，成员更新状态、添加评论，相关人收到通知，审计员能查看谁在何时改变了什么。任务卡要写明可编辑字段、通知对象、评论权限和任务关闭后的行为。',
        '通知必须由业务事件触发',
      ],
      [
        '角色权限映射到具体动作',
        '管理员可邀请/移除成员和管理工作区设置，负责人可创建项目和管理项目成员，普通成员可读取所属项目并更新有权限的任务，审计员只读审计记录。前端展示规则与后端授权必须使用同一套 capability 名称，避免页面和 API 判断不一致。',
        '权限按动作建模而不是按页面建模',
        {
          title: '打印 TeamFlow 的角色能力矩阵',
          language: 'javascript',
          code: `const roles = {
  ADMIN: ['workspace.update', 'member.invite', 'project.create', 'audit.read'],
  LEAD: ['project.create', 'task.assign', 'comment.create', 'audit.read'],
  MEMBER: ['task.update.own', 'comment.create'],
  AUDITOR: ['audit.read'],
};

for (const [role, capabilities] of Object.entries(roles)) {
  console.log(role + ': ' + capabilities.join(','));
}`,
          output: `ADMIN: workspace.update,member.invite,project.create,audit.read
LEAD: project.create,task.assign,comment.create,audit.read
MEMBER: task.update.own,comment.create
AUDITOR: audit.read`,
        },
      ],
      [
        '跨租户和撤权场景先写进流程',
        '普通成员不能通过修改 URL 读取另一个工作区的项目，工作区切换后前端缓存必须清空，撤权后已有请求和通知都不能继续使用旧权限。任务流程要包含 401、403、404、邀请过期、成员移除和角色变更。',
        '租户边界覆盖浏览器缓存和服务端缓存',
      ],
      [
        '非目标限定首版复杂度',
        '首版不做实时协同编辑、插件市场和微服务拆分，先完成清晰的全栈单体与可靠通知闭环。阶段结束前让第三人根据任务卡说明每个角色能做什么、不能做什么，以及租户隔离的证据在哪里。',
        '先证明单体边界再拆服务',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 范围、验收与非功能目标',
    track,
    contentStatus: 'reviewed',
    minutes: 40,
    prerequisite: '已有 TeamFlow 角色任务卡和流程，理解多租户、RBAC、对象归属与基础性能指标。',
    goal: '能把首版收敛为登录、工作区、邀请、项目、任务、评论、通知和审计，写出跨租户拦截、撤权、并发更新、通知送达和任务列表 P95 的可执行验收。',
    guidedPractice: '把每条主流程写成 Given/When/Then，再加两条失败路径：成员被撤权后立刻读取任务、两个负责人同时更新同一任务；最后把 P95、越权测试和通知最终送达转成可测门槛。',
    independentPractice: '交付 MVP 范围表、权限验收矩阵、性能与可用性指标表，以及一份首版不做的功能与原因说明。',
    commonErrors: [
      '只写“支持多租户”，没有规定数据库查询、缓存键、消息和日志都必须携带租户上下文。',
      '把权限变更当作普通 UI 状态，没有验证撤权后旧会话和旧缓存是否仍能写入。',
    ],
    sourceRefs: [
      'OWASP Authorization Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html',
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'PostgreSQL Performance Documentation. https://www.postgresql.org/docs/current/performance-tips.html',
    ],
    steps: [
      [
        'MVP 只保留协作闭环',
        '首版固定登录、工作区、成员邀请、项目、任务、评论、通知和审计列表；任务附件、实时协同编辑、插件市场和微服务拆分不进入范围。每个页面都要有数据归属、权限动作和失败路径，不能只靠隐藏导航实现边界。',
        '先完成一条可审计协作闭环',
      ],
      [
        '验收场景同时包含租户与角色',
        '把“用户能查看任务”改写成“工作区 A 的 MEMBER 只能读取自己项目中的任务，请求体或 URL 改成工作区 B 时返回 403 或 404，数据库和缓存均无跨租户读取”。把“负责人可分配任务”改写成“只有 LEAD 且属于该项目的成员可以分配”。',
        '每条权限验收都要有反例',
      ],
      [
        '性能目标绑定真实列表和索引',
        '任务列表以 tenant_id、workspace_id、project_id 和状态为首要过滤条件，目标 P95 小于三百毫秒；测量要包含鉴权和数据量，不能只测空表。审计和通知不能拖慢主事务，分页必须稳定。',
        '性能目标必须包含权限过滤',
      ],
      [
        '通知验收以最终一致性表达',
        '任务创建或评论后，通知允许短时间异步送达，但数据库事务提交与 Outbox 写入必须同时成功；消息重复时通知消费者要幂等。验收检查“通知最终送达且不重复展示”，不宣称同步实时。',
        '通知验收同时检查最终送达与去重',
        {
          title: '把 TeamFlow 权限和性能场景汇总成门禁',
          language: 'javascript',
          code: `const scenarios = [
  { id: 'tenant-cross-read', passed: true },
  { id: 'revoked-member-write', passed: true },
  { id: 'lead-assign', passed: true },
  { id: 'outbox-written-in-transaction', passed: true },
  { id: 'task-list-p95', passed: 268 <= 300 },
];

const failed = scenarios.filter((item) => !item.passed);
console.log('passed=' + (scenarios.length - failed.length));
console.log('failed=' + (failed.length ? failed.map((item) => item.id).join(',') : 'none'));`,
          output: `passed=5
failed=none`,
        },
      ],
      [
        '范围变更要说明安全与迁移成本',
        '新增字段、角色或通知类型时先说明是否改变对象权限、是否影响旧客户端、是否需要数据库迁移和回填。不能在没有审计与回滚方案时把“批量导入成员”或“自定义角色”塞进首版。',
        '角色变化会改变整个授权面',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · API 契约与前端数据边界',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '已有 TeamFlow 角色与 MVP 验收，能写 REST 请求、JSON schema 和 TypeScript 类型。',
    goal: '能定义 workspace、member、project、task、comment、notification 的 REST 契约，明确租户上下文、幂等键、版本号、分页和权限错误，并让前端独立处理加载、无权限和冲突状态。',
    guidedPractice: '为六类资源写请求方法、路径、字段、权限条件与错误样例；用同一路径分别模拟缺少工作区、跨租户访问、旧版本更新和重复幂等键，观察前端应显示什么。',
    independentPractice: '交付契约文档、请求矩阵和错误模型，覆盖 401、403、404、409、422、429 和 503，并用契约样例启动 mock 后端。',
    commonErrors: [
      '把 workspaceId 放在请求体而鉴权上下文另有 tenant_id，两个来源不一致时产生越权或错误归属。',
      '任务更新不带 version，两个用户同时编辑时后写覆盖前写，接口却返回成功。',
    ],
    sourceRefs: [
      'Spring Security Authorization. https://docs.spring.io/spring-security/reference/servlet/authorization/index.html',
      'OpenAPI Specification. https://spec.openapis.org/oas/latest.html',
      'OWASP Authorization Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html',
    ],
    steps: [
      [
        '资源与动作命名保持稳定',
        'workspace、member、project、task、comment、notification 使用复数资源路径，动作通过 HTTP 方法表达；任务状态变化可设计独立 transition 端点，但必须明确前置状态、权限和副作用。路径中的 id 不能替代租户上下文。',
        '路径表达资源，服务端补充租户',
      ],
      [
        '租户上下文来自认证主体',
        '服务端从当前认证主体和成员关系解析 tenant_id，不接受客户端任意指定一个 tenant_id 作为授权依据；前端可传工作区选择，但后端必须验证用户属于该工作区并把它绑定到请求上下文。',
        '客户端传来的租户值只能作为选择请求',
      ],
      [
        '权限错误避免泄露对象存在性',
        '对象不存在或无权限可以统一返回 404，明确允许读取但禁止写才返回 403；错误体包含稳定 code、requestId 和 retryAfterMs，不返回 SQL、堆栈或其他租户名称。',
        '错误信息不能泄漏跨租户数据',
      ],
      [
        '写操作带幂等键和版本号',
        '创建任务、评论和邀请使用 idempotency-key，更新任务带 If-Match 或 version，旧版本返回 409 和当前版本摘要；状态转换与 Outbox 在同一事务中提交，前端据此决定重新加载还是合并。',
        '幂等键防重复，版本号防覆盖',
        {
          title: '把 TeamFlow 权限错误解码为稳定前端动作',
          language: 'typescript',
          code: `type ApiProblem = {
  code: string;
  message: string;
  requestId: string;
  field?: string;
  currentVersion?: number;
};

function decode(status: number, payload: ApiProblem): string {
  if (status === 403) return 'blocked:' + payload.code;
  if (status === 404) return 'not-found-or-hidden:' + payload.requestId;
  if (status === 409) return 'reload:version=' + payload.currentVersion;
  if (status === 422) return 'focus:' + payload.field;
  return 'retry:' + payload.requestId;
}

console.log(decode(409, {
  code: 'TASK_VERSION_CONFLICT',
  message: '任务已被其他成员更新',
  requestId: 'req-74',
  currentVersion: 12,
}));`,
          output: `reload:version=12`,
        },
      ],
      [
        '前端数据边界按工作区切换清空',
        '切换工作区时取消旧项目请求、清理任务缓存和通知未读数，再加载新工作区；URL 保留 workspace、project、task 的可分享标识，但详情接口仍重新授权。分页使用不透明 cursor，筛选条件进入查询参数。',
        '切换租户必须清空旧租户缓存',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 数据模型、约束与迁移',
    track,
    contentStatus: 'reviewed',
    minutes: 48,
    prerequisite: '理解 PostgreSQL 外键、复合唯一键、事务和索引，已完成 TeamFlow 资源契约。',
    goal: '能为工作区、成员、项目、任务、评论、审计和 Outbox 设计 tenant_id 贯穿的数据模型，用复合外键和唯一约束防止跨租户关联，并写出角色变更、任务版本和通知迁移方案。',
    guidedPractice: '建 workspace、member、project、task 和 outbox 表，使用 tenant_id 与对象 id 的复合键建立归属；故意插入指向另一个租户的任务和重复成员关系，观察数据库拒绝。',
    independentPractice: '交付 ER 图、带约束的 DDL、迁移与回填步骤、索引清单和三条异常写入实验，要求所有业务表都能从 tenant_id 推导出访问边界。',
    commonErrors: [
      '只在应用查询里加 WHERE tenant_id，表和缓存键没有租户维度，某处漏写条件就造成泄漏。',
      'Outbox 与业务写入放在不同事务，数据库已提交但消息丢失，通知永远不出现。',
    ],
    sourceRefs: [
      'PostgreSQL Constraints. https://www.postgresql.org/docs/current/ddl-constraints.html',
      'PostgreSQL Row Security Policies. https://www.postgresql.org/docs/current/ddl-rowsecurity.html',
      'Transactional Outbox Pattern. https://microservices.io/patterns/data/transactional-outbox.html',
    ],
    steps: [
      [
        'tenant_id 贯穿所有关联表',
        'workspace、member、project、task、comment、audit 与 outbox 都保存 tenant_id；复合外键要求子对象与父对象属于同一租户，而不是只靠业务代码检查。用户账号可以是全局实体，但成员关系必须绑定工作区和租户。',
        '租户键要进入主外键关系',
      ],
      [
        '成员身份和邀请有唯一约束',
        '同一工作区同一用户只能有一条有效成员关系，邀请使用唯一 token 与过期时间，角色枚举由约束或字典表控制。成员移除保留历史，重新邀请创建新关系或明确恢复旧关系，不能悄悄覆盖审计。',
        '邀请与成员状态要分开',
      ],
      [
        '任务状态和版本一起建模',
        'task 包含 project_id、assignee_id、status、priority、version 与 deleted_at；状态转移由服务层校验并写审计，version 用于乐观并发。评论记录 task_id 与作者，软删除后仍保留审计引用。',
        '版本号保护并发更新',
      ],
      [
        '审计和 Outbox 追加写不可改',
        'audit_log 记录 actor、action、object_type、object_id、before/after 摘要和 request_id；outbox 与业务变更在同一事务写入消息类型、payload、状态和重试次数。两者都按时间追加，不允许普通业务更新历史记录。',
        '审计与消息意图必须同事务写入',
        {
          title: '用复合键阻止 TeamFlow 跨租户任务',
          language: 'sql',
          code: `CREATE TABLE workspace (
  id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (id, tenant_id)
);

CREATE TABLE project (
  id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES workspace (id, tenant_id)
);

CREATE TABLE task (
  id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('TODO', 'DOING', 'DONE')),
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (project_id, tenant_id)
    REFERENCES project (id, tenant_id)
);

INSERT INTO workspace VALUES (10, 7, '产品交付');
INSERT INTO project VALUES (20, 7, 10, '移动端改版');
INSERT INTO task VALUES (30, 7, 20, '修复登录', 'TODO', 1);

UPDATE task
SET status = 'DOING', version = version + 1
WHERE id = 30 AND tenant_id = 8;
SELECT changes() AS cross_tenant_updates;`,
          output: `cross_tenant_updates
0`,
        },
      ],
      [
        '迁移先扩字段再收紧约束',
        '给旧表增加 tenant_id 时先允许空，根据工作区和项目关系回填，建立复合索引并验证孤儿数据，再升级外键与非空；角色变更增加 invite_status 和过期字段时保留旧 token 读取路径。所有回填都可重复执行，并记录影响行数。',
        '迁移先兼容再收紧',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 项目骨架、模块边界与本地环境',
    track,
    contentStatus: 'reviewed',
    minutes: 50,
    prerequisite: '拥有 TeamFlow 数据模型和接口契约，能使用 Gradle、Node.js、pnpm、Docker Compose 及 Java 21。',
    goal: '能从空目录建立 Spring Boot 模块化单体、Vue 3 前端和本地 PostgreSQL、Redis、RabbitMQ 环境，按领域模块划清依赖方向，并让新成员一条命令启动最小协作链路。',
    guidedPractice: '创建 identity、workspace、project、task、notification、audit 六个领域包与共享 infrastructure；前端建立工作区、项目、任务、通知页面，Compose 启动数据库、Redis 和 RabbitMQ，并记录启动健康检查。',
    independentPractice: '交付 Gradle 多模块或单模块领域目录、Vue 工程、Compose、环境样例、依赖图和一条从登录到创建任务的本地验证记录。',
    commonErrors: [
      '按 controller/service/repository 三层全局堆代码，任务领域调用通知和审计时形成循环依赖。',
      '把数据库密码、JWT 密钥和 RabbitMQ 凭据写入 application.yml 并提交仓库。',
    ],
    sourceRefs: [
      'Gradle User Manual. https://docs.gradle.org/current/userguide/userguide.html',
      'Spring Boot Reference. https://docs.spring.io/spring-boot/reference/',
      'Vue.js Quick Start. https://vuejs.org/guide/quick-start.html',
    ],
    steps: [
      [
        '领域模块表达业务边界',
        'identity 负责用户与认证，workspace 负责租户和成员，project 负责项目，task 负责任务与评论，notification 负责 Outbox 消费者，audit 负责只追加记录；模块间通过明确应用服务或领域事件协作，基础设施只提供数据库、消息和观测能力。',
        '模块名对应业务语言',
      ],
      [
        '前后端共享契约但不共享运行时对象',
        'packages/contracts 存放 OpenAPI、错误码和生成类型，前端只使用序列化 DTO；Spring 实体不直接作为 API 返回，Vue 页面也不依赖数据库字段顺序。',
        '共享的是协议而非数据库实体',
      ],
      [
        '本地依赖用 Compose 固定健康检查',
        'PostgreSQL、Redis 和 RabbitMQ 固定小版本与端口，启动后等待健康检查再运行应用；迁移使用 Flyway 或 Liquibase，种子数据通过显式 profile 加载，不能每次启动自动写入生产数据。',
        '依赖健康后才能启动应用',
      ],
      [
        '一条命令完成最小链路验证',
        'README 提供安装、迁移、启动后端、启动前端和运行测试命令；新成员执行后应能登录测试账号，创建项目，添加任务并看到通知更新。启动失败时日志要指出依赖、端口或迁移问题。',
        '最小链路验证要覆盖登录到通知',
        {
          title: '建立并核对 TeamFlow 模块骨架',
          language: 'bash',
          code: `mkdir -p services/teamflow/src/main/java/com/teamflow/{identity,workspace,project,task,notification,audit}
cd services/teamflow
gradle wrapper --gradle-version 8.10
./gradlew projects
./gradlew bootRun --args='--spring.profiles.active=local'`,
          output: `Root project 'teamflow'
+--- Project ':app'
+--- Project ':contracts'
+--- Project ':domain'
+--- Project ':infrastructure'
Started TeamflowApplication in 4.182 seconds`,
        },
      ],
      [
        '从干净环境复现并记录配置',
        '删除本地卷和 node_modules 后按 README 重启，检查数据库迁移、RabbitMQ 队列、Redis 连接和前端代理；环境变量通过 .env.example 说明，不提交真实秘密。阶段结束时提交依赖图与本地验证日志。',
        '项目骨架必须可由第三人复现',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 后端核心链路与异常恢复',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'TeamFlow 模块化骨架可启动，掌握 Spring Security、事务、对象归属、幂等和 Outbox 基本概念。',
    goal: '能实现创建工作区、分配任务、更新状态和写评论的核心后端链路，在事务内完成对象级授权、审计与 Outbox，并证明重复请求、版本冲突和消息失败不会产生脏数据。',
    guidedPractice: '先实现 createTask 与 transitionTask，每次从认证主体解析租户，查询对象后检查角色和归属，再在同一事务写入业务表、audit_log 与 outbox；用重复幂等键和旧 version 触发失败。',
    independentPractice: '交付核心服务、权限测试、事务回滚测试、Outbox 消费测试和结构化错误记录，证明数据库提交失败时不发送消息，消息失败时可安全重试。',
    commonErrors: [
      '只在 Controller 上检查角色，没有验证任务是否属于当前项目和工作区，形成对象级越权。',
      '先提交任务事务再单独插入 Outbox，第二步失败后任务存在但通知永远不会发送。',
    ],
    sourceRefs: [
      'Spring Security Method Security. https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html',
      'Spring Transaction Management. https://docs.spring.io/spring-framework/reference/data-access/transaction.html',
      'RabbitMQ Reliability Guide. https://www.rabbitmq.com/docs/reliability',
    ],
    steps: [
      [
        '认证后仍要加载对象归属',
        '当前用户已登录不代表能操作任意任务；服务层按 tenant_id、workspace_id、project_id 和 task_id 加载对象，再检查成员角色、项目成员关系和任务归属。管理员的跨项目能力也应有明确能力名与审计。',
        '对象级授权必须读取真实归属',
      ],
      [
        '写操作在一个事务内完成业务、审计和 Outbox',
        '任务创建、状态变更或评论写入时，在同一事务插入 audit_log 与 outbox；数据库提交后消息消费者再异步发布通知。任何一步失败都回滚，业务代码不直接向 RabbitMQ 发送后继续提交。',
        '业务提交与消息意图同事务',
      ],
      [
        '幂等与乐观锁处理重复和冲突',
        '创建请求以 idempotency-key 去重，更新请求检查 version，旧版本返回 409；重复请求返回第一次结果，不能产生第二条审计。状态转换检查 TODO、DOING、DONE 的合法边与角色权限。',
        '重复请求与并发覆盖分别验收',
      ],
      [
        'Outbox 消费者使用至少一次语义',
        '消费者读取未发送记录，调用 RabbitMQ 发布，成功后标记 sent；发布超时可能造成重复消息，因此通知消费者按 eventId 去重。失败按退避重试并记录 attempt、lastError 和 nextAttemptAt。',
        '消息至少一次，消费者必须幂等',
        {
          title: '在 Java 服务中检查租户、对象与 Outbox',
          language: 'java',
          code: `import java.util.ArrayList;
import java.util.List;

record AssignTask(long tenantId, long workspaceId, long taskId, String requestId) {}
record Task(long id, long tenantId, long workspaceId, String title) {}
record Outbox(String eventId, String type, long taskId) {}

class Forbidden extends RuntimeException {
  Forbidden(String message) { super(message); }
}

class TaskService {
  private final List<Outbox> outbox = new ArrayList<>();
  private final Task task = new Task(30, 7, 10, "修复登录");

  void assign(AssignTask command) {
    if (command.tenantId() != task.tenantId() ||
        command.workspaceId() != task.workspaceId()) {
      throw new Forbidden("workspace mismatch");
    }
    outbox.add(new Outbox(command.requestId(), "task.assigned", task.id()));
    System.out.println("assigned=" + task.id() + " outbox=" + outbox.size());
  }
}

public class Main {
  public static void main(String[] args) {
    TaskService service = new TaskService();
    service.assign(new AssignTask(7, 10, 30, "evt-1"));
    try {
      service.assign(new AssignTask(8, 10, 30, "evt-2"));
    } catch (Forbidden error) {
      System.out.println("blocked=" + error.getMessage());
    }
  }
}`,
          output: `assigned=30 outbox=1
blocked=workspace mismatch`,
        },
      ],
      [
        '错误与恢复信号保持一致',
        '权限、冲突、校验和依赖失败分别返回不同 code，日志只记录 requestId、租户、对象 id 与错误类别；Outbox 积压、发布失败和死信进入指标，不能靠翻日志猜消息是否送达。接口成功后前端可查询通知状态。',
        '错误码和运维指标共享同一事件身份',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 前端页面、状态与可访问交互',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'TeamFlow 核心 API 已可运行，掌握 Vue 3 组件、组合式 API、路由和 TypeScript 类型。',
    goal: '能实现工作区切换、项目任务看板、成员管理和审计只读页，覆盖加载、空、无权限、版本冲突和移动端布局，并让键盘与屏幕阅读器用户完成创建和更新任务。',
    guidedPractice: '先实现静态工作区与任务卡，再接 API 和路由；用两个角色查看同一任务、切换工作区、制造 409 和 403，最后在移动宽度走查任务状态更新与评论。',
    independentPractice: '交付工作区、任务看板、成员管理和审计页面，附四组状态截图、键盘走查和 320px 布局报告。',
    commonErrors: [
      '切换工作区只替换标题，没有取消旧请求和清空 Pinia 缓存，短暂显示上一租户任务。',
      '无权限时简单隐藏按钮但不给原因，用户无法知道是角色不足、对象不存在还是会话过期。',
    ],
    sourceRefs: [
      'Vue Router Navigation Guards. https://router.vuejs.org/guide/advanced/navigation-guards.html',
      'Vue.js Accessibility. https://vuejs.org/guide/best-practices/accessibility.html',
      'WCAG 2.2. https://www.w3.org/TR/WCAG22/',
    ],
    steps: [
      [
        '工作区切换作为数据边界事件',
        '切换时取消旧项目请求、清空旧任务与通知缓存、更新 URL 和当前成员权限，再加载新工作区；如果请求失败，保留当前工作区并显示错误，不把旧租户数据和新标题混合。',
        '切换租户要先清理旧状态',
      ],
      [
        '任务看板按状态与角色呈现',
        '看板列来自稳定状态枚举，任务卡展示标题、负责人、优先级和版本；普通成员只能更新有权限的任务，负责人可以分配。拖拽不能作为唯一操作方式，键盘用户必须能通过菜单选择状态。',
        '拖拽只是增强，不是唯一入口',
      ],
      [
        '权限与冲突使用明确状态',
        '403 显示“当前角色不能执行此操作”，404 显示“对象不存在或无权查看”，409 显示版本冲突并提供重新加载最新任务；会话过期跳登录前保留目标 URL，避免用户丢失上下文。',
        '不要把所有失败都显示成网络错误',
      ],
      [
        '成员管理和审计页面保持只读边界',
        '管理员可以邀请、撤销和修改角色，普通成员只读成员列表；审计员只看操作时间线和筛选，不出现编辑按钮。邀请链接和 token 不在页面日志暴露，撤销操作二次确认并说明影响。',
        '角色管理动作必须带二次确认和审计',
        {
          title: '渲染 TeamFlow 无权限任务卡的可访问输出',
          language: 'javascript',
          code: `import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

const TaskCard = {
  props: {
    title: { type: String, required: true },
    canEdit: { type: Boolean, required: true },
  },
  setup(props) {
    return () => h('article', [
      h('h3', props.title),
      h('p', props.canEdit ? '你可以更新此任务' : '只读：当前角色无权修改'),
      props.canEdit ? h('button', '更新状态') : null,
    ]);
  },
};

const app = createSSRApp({
  render: () => h(TaskCard, { title: '修复登录', canEdit: false }),
});
console.log(await renderToString(app));`,
          output: `<article><h3>修复登录</h3><p>只读：当前角色无权修改</p></article>`,
        },
      ],
      [
        '移动端与长文本遵循真实任务',
        '320px 下看板改成按状态切换的列表，任务标题、负责人和状态不重叠；长项目名在可访问名称中完整保留，界面可截断但需有标题或详情入口。触控目标、错误提示和返回路径都可在单手操作范围内完成。',
        '移动端保留任务动作而非缩小桌面看板',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 联调、测试、安全与性能',
    track,
    contentStatus: 'reviewed',
    minutes: 56,
    prerequisite: 'TeamFlow 前后端核心链路已运行，能写 JUnit/MockMvc 测试、数据库集成测试和 Playwright 场景。',
    goal: '能验证租户隔离、对象级授权、撤权、版本冲突、Outbox 幂等和任务列表性能，建立跨层回归证据，并识别缓存权限和异步通知的安全边界。',
    guidedPractice: '为每个角色与资源建立权限矩阵测试，用两个工作区互相访问项目和任务；再执行撤权后请求、并发更新、重复消息和 P95 压测。',
    independentPractice: '交付权限矩阵测试报告、租户隔离集成测试、并发与通知幂等实验、性能 EXPLAIN 或压测结果，以及至少两个修复前后对照。',
    commonErrors: [
      '只在 Controller 测试一个 403，没有覆盖服务层、数据库查询和缓存中的对象归属。',
      '在事务提交前查询 Outbox 并断言消息已发送，测试时序与真实异步链路不一致。',
    ],
    sourceRefs: [
      'Spring Security Testing. https://docs.spring.io/spring-security/reference/servlet/test/index.html',
      'OWASP ASVS. https://owasp.org/www-project-application-security-verification-standard/',
      'RabbitMQ Reliability Guide. https://www.rabbitmq.com/docs/reliability',
    ],
    steps: [
      [
        '权限矩阵覆盖角色、对象和动作',
        '至少组合 ADMIN、LEAD、MEMBER、AUDITOR 与工作区、项目、任务、评论、审计动作，分别断言允许与拒绝；跨租户读取和写入必须用真实数据库集成测试，不能只在 mock 上验证。',
        '权限测试要把反例放在同一矩阵里',
      ],
      [
        '撤权与缓存测试需要时间维度',
        '成员移除或角色下降后立即访问任务列表、详情、评论和通知，并检查 Redis 缓存是否被清理；若使用旧权限缓存，必须验证失效事件和最大容忍时间。',
        '撤权有效期是安全指标',
      ],
      [
        '并发与 Outbox 测试验证最终结果',
        '两个请求使用同一任务版本更新，只有一个成功；重复 idempotency-key 只产生一条任务与一条审计；消息消费者重复收到同一事件只创建一条通知。检查数据库、Outbox 和通知三个位置。',
        '最终一致性要核对数据库、Outbox 与通知',
      ],
      [
        '性能测试绑定真实查询和索引',
        '在足够多的项目和任务数据下测列表 P95，检查 tenant_id、workspace_id、project_id、status 与排序字段的复合索引；同时观察权限查询是否造成 N+1。优化前后记录执行计划、吞吐和缓存命中。',
        '性能数据必须来自带权限过滤的查询',
        {
          title: '运行 TeamFlow 跨租户隔离回归',
          language: 'java',
          code: `import java.util.List;

record Task(long tenantId, long id, String title) {}
class CrossTenantAccess extends RuntimeException {
  CrossTenantAccess(String message) { super(message); }
}

public class Main {
  static List<Task> tasks = List.of(
    new Task(7, 101, "修复登录"),
    new Task(8, 201, "设计权限")
  );

  static Task load(long tenantId, long taskId) {
    return tasks.stream()
      .filter((task) -> task.tenantId() == tenantId && task.id() == taskId)
      .findFirst()
      .orElseThrow(() -> new CrossTenantAccess("task hidden"));
  }

  public static void main(String[] args) {
    System.out.println("own=" + load(7, 101).title());
    try {
      load(7, 201);
    } catch (CrossTenantAccess error) {
      System.out.println("cross-tenant=" + error.getMessage());
    }
  }
}`,
          output: `own=修复登录
cross-tenant=task hidden`,
        },
      ],
      [
        '安全、可访问性和性能共同交付',
        '检查错误响应和日志不含邀请 token、邮件和完整评论；前端无权限状态可读；任务列表在移动端和慢网络仍能操作。测试报告按风险列出结论，不用“所有测试通过”掩盖未验证边界。',
        '测试证据必须覆盖用户与攻击者路径',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 容器、CI/CD、可观测与发布',
    track,
    contentStatus: 'reviewed',
    minutes: 54,
    prerequisite: 'TeamFlow 前后端与数据库迁移可本地运行，理解容器、Actuator、OTel、RabbitMQ 和发布回滚。',
    goal: '能构建前后端不可变镜像，发布数据库迁移、配置、健康检查、日志、指标和 Trace，设计先兼容后切换的发布顺序，并证明旧版本与失败发布可回滚。',
    guidedPractice: '构建 app 与 web 镜像，Compose 启动 PostgreSQL、Redis、RabbitMQ 与 collector；验证 readiness、登录、任务列表、Outbox 消费和 Actuator 指标，再执行一次滚动发布。',
    independentPractice: '交付 Dockerfile、CI、Compose 或部署清单、迁移清单、仪表盘截图、发布与回滚手册，并记录一次旧版本任务更新兼容测试。',
    commonErrors: [
      '应用启动时自动执行不兼容迁移，旧实例仍在运行时表结构已改变导致读写失败。',
      '健康检查只验证 HTTP 200，没有检查数据库、Redis、RabbitMQ 和迁移状态。',
    ],
    sourceRefs: [
      'Docker Multi-stage Builds. https://docs.docker.com/build/building/multi-stage/',
      'Spring Boot Actuator. https://docs.spring.io/spring-boot/reference/actuator/',
      'OpenTelemetry Semantic Conventions. https://opentelemetry.io/docs/specs/semconv/',
    ],
    steps: [
      [
        '应用、前端与迁移使用独立阶段',
        'Spring Boot 镜像只包含运行时与已验证的 jar，Vue 前端构建为静态制品，数据库迁移作为单独命令或 init job；镜像标签绑定提交哈希，不在运行时下载依赖。',
        '构建与迁移不能混在应用启动脚本里',
      ],
      [
        '配置和秘密外置',
        '数据库 URL、Redis、RabbitMQ、JWT 和 OTel 配置通过环境或秘密存储注入，application.yml 只保留非敏感默认值；配置变更需要有审批和环境差异说明。',
        '秘密不进入镜像和仓库',
      ],
      [
        'readiness 覆盖依赖与迁移版本',
        'liveness 只检查 JVM 是否卡死，readiness 检查数据库连接、Redis、RabbitMQ 和迁移版本；Outbox 消费积压另设业务指标，不能把消息队列短暂延迟误判为应用不可用。',
        '不同依赖使用不同健康信号',
      ],
      [
        'Trace 和指标围绕一次任务流转',
        '记录请求、数据库事务、Outbox 写入、消息发布、通知消费和前端更新；标签包含 tenant_id 的脱敏标识、workspace_id、操作类型与结果，不含邮箱、token 和评论正文。',
        '一次任务流转要能跨服务追踪',
        {
          title: '定义 TeamFlow 本地发布拓扑',
          language: 'yaml',
          code: `services:
  web:
    image: teamflow-web:r27
    ports: ["3000:3000"]
    depends_on:
      app:
        condition: service_healthy
  app:
    image: teamflow-app:r27
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/teamflow
      SPRING_REDIS_HOST: redis
      SPRING_RABBITMQ_HOST: rabbitmq
      MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE: health,info,metrics,prometheus
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health/readiness"]
      interval: 10s
      timeout: 3s
      retries: 5
    depends_on: [postgres, redis, rabbitmq]
  postgres:
    image: postgres:16.4
  redis:
    image: redis:7.4
  rabbitmq:
    image: rabbitmq:3.13-management

networks:
  default:
    name: teamflow-local`,
          output: `docker compose config --services
web
app
postgres
redis
rabbitmq
readiness=UP
outbox-lag-seconds=0`,
        },
      ],
      [
        '发布先兼容接口再切换流量',
        '数据库先做向后兼容迁移，应用先支持新旧字段和事件，再发布前端，最后移除旧字段；发布中检查登录、任务读取、状态更新、通知和审计。失败时回滚镜像与配置，数据和消息按兼容策略处理，不能只切标签。',
        '发布顺序必须覆盖旧客户端与旧消费者',
      ],
    ],
  },
  {
    name: '综合训练 · TeamFlow 协作 SaaS · 故障演练、回滚与项目答辩',
    track,
    contentStatus: 'reviewed',
    minutes: 52,
    prerequisite: 'TeamFlow 已可发布并有健康检查与运行手册，能读取 RabbitMQ、Redis、数据库和 OTel 指标。',
    goal: '能演练 RabbitMQ 延迟、缓存撤权失效、数据库复制延迟和旧权限版本回滚，选择暂停通知、撤销缓存或回滚服务的正确动作，并用审计和运行图完成答辩。',
    guidedPractice: '先延迟 RabbitMQ 消费，再制造撤权后缓存仍返回旧角色，最后切换旧权限版本；每次记录用户可见影响、Outbox 积压、越权风险、恢复动作和审计证据。',
    independentPractice: '交付故障演练报告、恢复脚本、运行手册、架构 ADR 和十分钟答辩材料，覆盖多租户隔离、Outbox、一致性、权限撤销和下一步演进。',
    commonErrors: [
      'RabbitMQ 故障时直接删除 Outbox 记录以便恢复队列，造成通知永久丢失且无审计。',
      '撤权后只清浏览器缓存，没有清 Redis 权限缓存和关闭已有会话，旧角色仍可写入。',
    ],
    sourceRefs: [
      'RabbitMQ Reliability Guide. https://www.rabbitmq.com/docs/reliability',
      'Spring Security Session Management. https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html',
      'Google SRE Workbook. https://sre.google/workbook/table-of-contents/',
    ],
    steps: [
      [
        '消息延迟先保护通知而不丢失事实',
        '延迟或停止 RabbitMQ 消费时，任务和审计仍应在数据库提交，Outbox 积压可观察；暂停发送与重试而不是删除记录，恢复后按 eventId 去重发送。通知延迟要在界面或运营告警中可见。',
        'Outbox 积压是待处理事实，不是垃圾',
      ],
      [
        '撤权故障按所有缓存层排查',
        '移除成员后，浏览器、Redis、服务端本地缓存和已有会话都可能保留旧权限；演练要验证下一次请求被拒绝、旧 SSE 或轮询连接被关闭、审计记录角色变更。缓存键包含租户和成员版本。',
        '撤权要清理所有权限副本',
      ],
      [
        '复制延迟下读取自己的写入',
        '让主库写入任务后从只读副本读取，可能看到旧版本或看不到新任务；关键写后读应使用主库或版本等待策略。演练记录主从延迟、任务版本和用户看到的最终结果。',
        '写后读不能默认副本已同步',
        {
          title: '模拟 TeamFlow 消息延迟与撤权后的安全动作',
          language: 'javascript',
          code: `const state = {
  rabbitLagSeconds: 95,
  outboxPending: 42,
  cacheRole: 'LEAD',
  currentRole: 'MEMBER',
};

const actions = [];
if (state.rabbitLagSeconds > 60) actions.push('pause-consumer-and-alert');
if (state.outboxPending > 0) actions.push('keep-outbox-for-retry');
if (state.cacheRole !== state.currentRole) actions.push('evict-auth-cache');
if (state.currentRole === 'MEMBER') actions.push('deny-task-assign');

console.log('rabbit=lagging outbox=' + state.outboxPending);
console.log(actions.join(','));
console.log('assign=403 CACHE_ROLE_STALE');`,
          output: `rabbit=lagging outbox=42
pause-consumer-and-alert,keep-outbox-for-retry,evict-auth-cache,deny-task-assign
assign=403 CACHE_ROLE_STALE`,
        },
      ],
      [
        '回滚要同时考虑数据库、缓存和消息',
        '旧版本无法解析新事件时停止消费者并保留 Outbox，版本回滚后按兼容 schema 重放；旧权限模型回滚需要锁定成员变更、重建缓存并记录审计。回滚成功标准是租户隔离测试、任务更新、通知恢复和审计连续。',
        '回滚结束前不能恢复正常权限流量',
      ],
      [
        '答辩用一条任务讲清整个系统',
        '从管理员邀请成员开始，讲到负责人分配任务、成员更新、事务写 Outbox、消费者发通知、审计员查看记录，再说明跨租户攻击、撤权、消息延迟和回滚如何被拦截。最后给出未来拆分条件与不拆的理由。',
        '业务链路、权限边界和运维证据要讲在同一条线上',
      ],
    ],
  },
];

const STUDIO_EXAMPLES: ProjectExampleGrid = [
  [
    example(
      '把 Studio 四类角色的决策链打印出来',
      'javascript',
      `const roles = [
  { actor: '品牌负责人', decision: '服务定位是否可信', evidence: '首页主张 + 三个案例' },
  { actor: '潜在客户', decision: '是否发起咨询', evidence: '行业案例 + 结果' },
  { actor: '内容编辑', decision: '能否安全发布', evidence: 'schema 校验 + 预览' },
  { actor: '移动访客', decision: '是否继续阅读', evidence: '首屏 + 无遮挡导航' },
];
for (const role of roles) console.log(role.actor + ' -> ' + role.decision + ' <- ' + role.evidence);`,
      `品牌负责人 -> 服务定位是否可信 <- 首页主张 + 三个案例
潜在客户 -> 是否发起咨询 <- 行业案例 + 结果
失败边界：角色没有触发条件和离开原因时，不得用年龄画像代替任务`,
    ),
    undefined,
    example(
      '把 Studio 主流程与异常流程写成可执行路径',
      'typescript',
      `type Screen = 'home'|'caseCatalog'|'caseDetail'|'inquiry'|'success';
const path: Screen[] = ['home','caseCatalog','caseDetail','inquiry','success'];
const failures = [
  { at: 'caseCatalog', state: 'empty-filter', recovery: 'clear-filter' },
  { at: 'caseDetail', state: 'stale-content', recovery: 'show-reviewed-date' },
  { at: 'inquiry', state: 'network-error', recovery: 'keep-draft-and-retry' },
];
console.log(path.join(' -> '));
for (const f of failures) console.log(f.at + ':' + f.state + ' => ' + f.recovery);`,
      `home -> caseCatalog -> caseDetail -> inquiry -> success
caseCatalog:empty-filter => clear-filter
inquiry:network-error => keep-draft-and-retry
失败边界：异常流程不能返回主任务或丢失表单时，流程评审失败`,
    ),
    example(
      '用真实案例字段检查内容证据是否完整',
      'javascript',
      `const cases = [
  { slug: 'retail-rebuild', industry: '零售', result: '结算时长下降 38%', proof: '/evidence/retail.pdf' },
  { slug: 'clinic-brand', industry: '医疗', result: '待客户确认', proof: null },
  { slug: 'factory-site', industry: '制造', result: '询盘增长 24%', proof: '/evidence/factory.pdf' },
];
for (const item of cases) {
  const publishable = Boolean(item.result && item.proof);
  console.log(item.slug + ' publishable=' + publishable);
}`,
      `retail-rebuild publishable=true
clinic-brand publishable=false
factory-site publishable=true
失败边界：没有公开证据的结果标为内容风险，不能编造指标或把内部截图上线`,
    ),
    example(
      '用第三人复述检查需求是否可理解',
      'javascript',
      `const questions = [
  ['who', '第一次访问 Studio 的潜在客户能否说出服务对象？'],
  ['why', '内容编辑能否说明发布一条案例需要几步？'],
  ['success', '移动访客能否指出提交成功后发生什么？'],
  ['failure', '表单失败后用户能否知道如何继续？'],
];
const answers = ['能', '能', '不能', '能'];
questions.forEach(([key, question], i) => {
  console.log(key + ' pass=' + (answers[i] === '能') + ' ' + question);
});`,
      `who pass=true 第一次访问 Studio 的潜在客户能否说出服务对象？
success pass=false 移动访客能否指出提交成功后发生什么？
失败边界：任一问题答案为不能时先补流程证据，不进入页面开发`,
    ),
  ],
  [
    example(
      '用文件清单冻结 Studio 五个页面和三条案例',
      'shell',
      `printf '%s\\n' home services cases about contact > scope/pages.txt
printf '%s\\n' retail-rebuild clinic-brand factory-site > scope/cases.txt
test "$(wc -l < scope/pages.txt)" -eq 5
test "$(wc -l < scope/cases.txt)" -eq 3
grep -q 'customer-login' scope/pages.txt && exit 1 || echo 'PASS scope frozen'`,
      `pages=5 cases=3
PASS scope frozen
失败边界：页面增加或案例少于三条时脚本退出 1，新需求必须更新范围与验收`,
    ),
    example(
      '把首页、案例筛选和表单错误写成验收场景',
      'gherkin',
      `Feature: Studio 咨询闭环
  Scenario: 首屏找到服务和咨询入口
    Given 320px 宽度的移动访客打开首页
    Then 首屏可见服务名称、一个案例和咨询按钮
    And 页面横向溢出为 0
  Scenario: 空邮箱提交
    When 用户提交空邮箱
    Then 焦点移动到邮箱输入
    And aria-describedby 指向 EMAIL_REQUIRED
    And 页面不刷新`,
      `2 scenarios (2 passed)
overflow=0 focus=email errorId=EMAIL_REQUIRED
失败边界：错误只显示 Toast 或页面刷新导致输入丢失时验收失败`,
    ),
    undefined,
    example(
      '用 Playwright 同时检查触屏遮挡和键盘关闭菜单',
      'typescript',
      `test('studio mobile navigation is keyboard safe', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '打开导航' });
  await trigger.click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});`,
      `1 passed
menuVisible=true focusReturned=true scrollWidth=320
失败边界：固定菜单遮住咨询按钮、Escape 无效或焦点丢失时测试失败`,
    ),
    example(
      '用门禁拒绝没有验收关联的范围变更',
      'javascript',
      `const change = { name: 'customer-login', taskCard: null, acceptance: [], performanceImpact: null };
const accepted = Boolean(change.taskCard && change.acceptance.length && change.performanceImpact);
console.log(JSON.stringify({ ...change, decision: accepted ? 'ACCEPT' : 'BACKLOG' }));
if (!accepted) process.exitCode = 1;`,
      `{"name":"customer-login","decision":"BACKLOG"}
reason=missing task card acceptance and performance impact
失败边界：命令退出码为 1，CI 不得把评论区提出的新页面直接加入首版`,
    ),
  ],
  [
    example(
      '用 JSON Schema 固定案例与页面内容对象',
      'json',
      `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["slug", "industry", "title", "problem", "action", "result", "status", "version"],
  "properties": {
    "slug": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "status": { "enum": ["draft", "review", "published", "archived"] },
    "version": { "type": "integer", "minimum": 1 },
    "proof": { "type": ["string", "null"] }
  },
  "additionalProperties": false
}`,
      `{"slug":"retail-rebuild","status":"published","version":4}
PASS schema validation
失败边界：缺少 slug、使用中文路径键或 published 没有证据时契约校验失败`,
    ),
    example(
      '只收集完成咨询所需字段并返回字段级错误',
      'json',
      `{
  "name": "林青",
  "email": "lin@example.com",
  "company": "青禾零售",
  "projectType": "brand-site",
  "budget": "100k-200k",
  "message": "需要重做企业官网并支持案例更新。",
  "sourcePath": "/cases/retail-rebuild"
}`,
      `POST /api/inquiries -> 201 {"id":"inq_01","status":"received"}
invalid email -> 422 {"code":"EMAIL_INVALID","field":"email","requestId":"r-42"}
失败边界：不要把预算、令牌或用户未填写的数据默认塞入请求`,
    ),
    undefined,
    example(
      '用状态机约束联系表单的可恢复状态',
      'typescript',
      `type State = 'idle'|'validating'|'submitting'|'success'|'field_error'|'rate_limited'|'offline';
const transitions: Record<State, State[]> = {
  idle: ['validating'], validating: ['submitting','field_error','offline'],
  submitting: ['success','field_error','rate_limited','offline'],
  field_error: ['validating'], rate_limited: ['validating'],
  offline: ['validating'], success: [],
};
function move(from: State, to: State) {
  if (!transitions[from].includes(to)) throw new Error('illegal ' + from + '->' + to);
  return to;
}
console.log(move('submitting','rate_limited'));`,
      `rate_limited
失败边界：提交中再次点击只能忽略或复用同一 idempotency-key，不能重新进入 submitting`,
    ),
    example(
      '让 mock 与真实接口共同通过契约样例',
      'typescript',
      `import { validate } from 'jsonschema';
import schema from '../contracts/inquiry.response.schema.json';
const samples = [
  { status: 201, body: { id: 'inq_1', code: 'RECEIVED', requestId: 'r1' } },
  { status: 422, body: { code: 'EMAIL_INVALID', field: 'email', requestId: 'r2' } },
  { status: 429, body: { code: 'RATE_LIMITED', retryAfterMs: 3000, requestId: 'r3' } },
];
for (const sample of samples) {
  const result = validate(sample.body, schema);
  console.log(sample.status + ' valid=' + result.valid);
}`,
      `201 valid=true
422 valid=true
429 valid=true
失败边界：mock 返回字符串 message 而真实实现返回 code 时，样例校验失败`,
    ),
  ],
  [
    example(
      '用关系表分开页面、服务与案例',
      'sql',
      `CREATE TABLE page (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  seo_description text NOT NULL
);
CREATE TABLE service (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  summary text NOT NULL,
  sort_order integer NOT NULL
);
CREATE TABLE case_study (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  industry text NOT NULL,
  result text NOT NULL,
  status text NOT NULL
);`,
      `page=1 service=1 case_study=1
slug unique indexes=2
失败边界：把整页 HTML 放入单个 JSON 字段后无法按 slug 查询和独立发布时重新建模`,
    ),
    example(
      '用检查约束阻止非法发布状态和空发布时间',
      'sql',
      `ALTER TABLE case_study
  ADD CONSTRAINT ck_case_status
  CHECK (status IN ('draft','review','published','archived')),
  ADD CONSTRAINT ck_case_published_at
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  ADD CONSTRAINT ck_case_title_length
  CHECK (char_length(title) BETWEEN 4 AND 120);

INSERT INTO case_study(slug,title,status,result)
VALUES ('bad-case','无效案例','published','有结果');`,
      `ERROR: new row violates check constraint "ck_case_published_at"
FAIL invalid published case rejected
失败边界：前端提示只是体验层，数据库约束必须独立拒绝非法状态`,
    ),
    example(
      '用咨询幂等表保存首次请求结果',
      'sql',
      `CREATE TABLE inquiry_request (
  request_id text PRIMARY KEY,
  request_hash text NOT NULL,
  inquiry_id uuid NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO inquiry_request(request_id,request_hash,inquiry_id,response_json)
VALUES ('inq-r42','sha256:abc','inq_01','{"id":"inq_01","status":"received"}')
ON CONFLICT (request_id) DO NOTHING
RETURNING inquiry_id;`,
      `first request: inquiry_id=inq_01
duplicate request: 0 rows, cached response returned
失败边界：同一 request_id 但请求 hash 不同时返回 409，不能复用旧申请结果`,
    ),
    example(
      '按兼容读路径执行 Studio 字段迁移',
      'shell',
      `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE case_study ADD COLUMN proof_url text;
UPDATE case_study SET proof_url='/evidence/legacy.pdf'
WHERE status='published' AND proof_url IS NULL;
ALTER TABLE case_study ADD CONSTRAINT ck_published_proof
CHECK (status <> 'published' OR proof_url IS NOT NULL) NOT VALID;
SQL
psql "$DATABASE_URL" -Atc "select count(*) from case_study where status='published' and proof_url is null"`,
      `ALTER TABLE
UPDATE 3
ALTER TABLE
0
失败边界：回填未完成就 VALIDATE 约束会阻断旧应用写入，先确认双读版本已部署`,
    ),
    example(
      '用 EXPLAIN 验证案例列表筛选索引',
      'sql',
      `CREATE INDEX idx_case_published_industry
ON case_study (status, industry, published_at DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT slug, title, result
FROM case_study
WHERE status='published' AND industry='retail'
ORDER BY published_at DESC
LIMIT 12;`,
      `Index Scan using idx_case_published_industry
rows=3 actual time=0.031..0.039
Buffers: shared hit=4
失败边界：空表上的快速结果不能作为上线证据，必须用接近生产选择性验证`,
    ),
  ],
  [
    example(
      '用仓库目录清单表达 Studio 职责边界',
      'shell',
      `find src -maxdepth 3 -type d | sort
test -d src/pages && test -d src/features/cases && test -d src/content
rg -n "from '../pages|from '../features" src/content && exit 1
printf 'content imports=0\\n'`,
      `src/content
src/features/cases
src/features/inquiry
src/pages
content imports=0
失败边界：content 反向依赖 pages 或 features 时边界检查退出 1`,
    ),
    example(
      '让内容适配器校验 schema 后再交给页面',
      'typescript',
      `export async function getPublishedCases() {
  const raw = await loadJson('content/cases.json');
  const parsed = CaseListSchema.safeParse(raw);
  if (!parsed.success) throw new Error('invalid case content: ' + parsed.error.message);
  return parsed.data
    .filter((item) => item.status === 'published')
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
const cases = await getPublishedCases();
console.log('published=' + cases.length);`,
      `published=3
失败边界：schema 错误必须在构建期失败，页面不能直接 import 原始 JSON 越过适配器`,
    ),
    example(
      '让 mock 只覆盖联系请求的网络边界',
      'typescript',
      `export async function submitInquiry(input: InquiryInput): Promise<InquiryResult> {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (input.email === 'conflict@example.com') {
      return { kind: 'error', code: 'EMAIL_INVALID', field: 'email' };
    }
    return { kind: 'success', id: 'inq_mock_1', requestId: 'mock-r1' };
  }
  const response = await fetch('/api/inquiries', { method: 'POST', body: JSON.stringify(input) });
  return parseInquiryResponse(response);
}`,
      `mock success id=inq_mock_1 requestId=mock-r1
mock conflict code=EMAIL_INVALID field=email
失败边界：mock 只能在网络边界生效，组件本身不能判断 mode 或直接构造 Toast`,
    ),
    undefined,
    example(
      '删除产物后在干净目录重建 Studio',
      'shell',
      `rm -rf node_modules dist .cache playwright-report
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm exec playwright test --grep 'studio smoke'
node scripts/check-budget.mjs dist`,
      `install=frozen lockfile=PASS
build=PASS tests=PASS e2e=1 passed
LCP=2.1s CLS=0.03 overflow=0
失败边界：首次安装需要全局包、手工复制文件或未提交环境变量时重建不算完成`,
    ),
  ],
  [
    example(
      '用状态机限制联系申请只能合法迁移',
      'sql',
      `CREATE TABLE inquiry (
  id uuid PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('RECEIVED','VALIDATED','QUEUED','NOTIFIED','FAILED','RETRYABLE')),
  next_attempt_at timestamptz
);
UPDATE inquiry SET status='QUEUED'
WHERE id='inq_1' AND status IN ('RECEIVED','VALIDATED')
RETURNING id,status;
UPDATE inquiry SET status='QUEUED'
WHERE id='inq_1' AND status='NOTIFIED'`,
      `RECEIVED -> QUEUED: UPDATE 1
NOTIFIED -> QUEUED: UPDATE 0
失败边界：已通知申请不能被重试队列覆盖；失败必须保留 request_id 和原因`,
    ),
    example(
      '把服务端字段校验结果映射到输入框',
      'typescript',
      `const errors = [
  { code: 'NAME_REQUIRED', field: 'name', message: '请输入姓名' },
  { code: 'EMAIL_INVALID', field: 'email', message: '请输入有效邮箱' },
  { code: 'MESSAGE_TOO_SHORT', field: 'message', message: '至少填写 20 个字' },
];
function focusTarget(items: typeof errors) {
  const first = items[0];
  return first ? { fieldId: first.field, errorId: first.code.toLowerCase() } : null;
}
console.log(errors.map((e) => e.field + ':' + e.code).join(','));
console.log(focusTarget(errors));`,
      `name:NAME_REQUIRED,email:EMAIL_INVALID,message:MESSAGE_TOO_SHORT
{fieldId:"name",errorId:"name_required"}
失败边界：未知字段或 HTML 内容不能进入错误正文，焦点也不能落到隐藏输入`,
    ),
    example(
      '用适配器隔离通知副作用并记录投递状态',
      'typescript',
      `interface Notifier { send(input: NormalizedInquiry): Promise<Delivery>; }
class LearningNotifier implements Notifier {
  async send(input: NormalizedInquiry): Promise<Delivery> {
    const payload = { template: 'studio-inquiry-v3', requestId: input.requestId };
    console.log('notify-template=' + payload.template);
    return { status: 'queued', attempt: 1 };
  }
}
const delivery = await new LearningNotifier().send({ requestId: 'r-42' } as NormalizedInquiry);
console.log(JSON.stringify(delivery));`,
      `notify-template=studio-inquiry-v3
{"status":"queued","attempt":1}
失败边界：外部通知超时必须标记 RETRYABLE；普通日志不能写完整邮箱和需求正文`,
    ),
    undefined,
    example(
      '提交超时后复用提交号并保留用户草稿',
      'javascript',
      `const storageKey = 'studio:inquiry-draft';
const draft = { name: '林青', email: 'lin@example.com', message: '需要重做企业官网。' };
let idempotencyKey = sessionStorage.getItem('studio:submit-id');
if (!idempotencyKey) {
  idempotencyKey = crypto.randomUUID();
  sessionStorage.setItem('studio:submit-id', idempotencyKey);
}
localStorage.setItem(storageKey, JSON.stringify(draft));
console.log('retry-key-reused=true');
console.log('draft-kept=' + Boolean(localStorage.getItem(storageKey)));`,
      `retry-key-reused=true
draft-kept=true
失败边界：超时后重新生成键可能产生第二份申请；成功前不能清除草稿`,
    ),
  ],
  [
    example(
      '用 Playwright 验证移动导航打开、关闭和焦点归还',
      'typescript',
      `test('studio navigation preserves focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '打开导航' });
  await trigger.click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'auto');
});`,
      `1 passed
navigationVisible=true triggerFocused=true bodyOverflow=auto
失败边界：菜单遮住标题、打开后不能 Esc 或焦点落到页面开头时测试失败`,
    ),
    example(
      '让案例筛选保存在 URL 并可刷新恢复',
      'typescript',
      `function updateCaseFilter(urlText: string, industry: string | null) {
  const url = new URL(urlText);
  if (industry) url.searchParams.set('industry', industry);
  else url.searchParams.delete('industry');
  url.searchParams.delete('page');
  return url.pathname + url.search;
}
console.log(updateCaseFilter('https://studio.test/cases?industry=retail', 'manufacturing'));
console.log(updateCaseFilter('https://studio.test/cases?industry=retail', null));`,
      `/cases?industry=manufacturing
/cases
失败边界：无结果必须保留当前筛选并提供清除按钮，不能显示成页面 404`,
    ),
    example(
      '把字段错误与输入、摘要和焦点关联',
      'javascript',
      `const form = document.querySelector('form');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = form.elements.namedItem('email');
  if (!email.value.includes('@')) {
    email.setAttribute('aria-invalid', 'true');
    email.setAttribute('aria-describedby', 'email-error');
    document.querySelector('#email-error').textContent = '请输入有效邮箱';
    email.focus();
    document.querySelector('#form-summary').textContent = '有 1 个字段需要修正';
  }
});
console.log('error-linked=true focus=email summary=1');`,
      `error-linked=true focus=email summary=1
aria-invalid=true aria-describedby=email-error
失败边界：只把边框变红而屏幕阅读器无法获知错误时不算可访问`,
    ),
    undefined,
    example(
      '用真实用户路径验收导航、筛选和提交失败',
      'shell',
      `pnpm exec playwright test tests/studio.spec.ts \\
  --project=chromium-mobile --grep 'navigation|case-filter|inquiry-error'
pnpm exec axe-cli http://127.0.0.1:4173 --exit
node scripts/check-images.mjs --route / --viewport 320x800`,
      `playwright tests=3 passed=3
axe serious=0 critical=0
images missingDimensions=0 overflow=0
失败边界：截图好看但键盘或错误提示失败时仍不能发布`,
    ),
  ],
  [
    example(
      '先测试内容纯函数再测试浏览器路径',
      'typescript',
      `describe('case content', () => {
  it('filters unpublished and sorts by date', () => {
    const result = selectPublishedCases([
      { slug: 'a', status: 'draft', publishedAt: '2026-11-01' },
      { slug: 'b', status: 'published', publishedAt: '2026-10-01' },
      { slug: 'c', status: 'published', publishedAt: '2026-11-01' },
    ]);
    expect(result.map((item) => item.slug)).toEqual(['c', 'b']);
  });
});`,
      `case content > filters unpublished and sorts by date PASS
tests=1 assertions=2
失败边界：纯函数测试不能启动浏览器；发布过滤回归时页面测试仍可能掩盖问题`,
    ),
    example(
      '在 320、768、1440 三档宽度走完移动任务',
      'typescript',
      `for (const width of [320, 768, 1440]) {
  test('studio task at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('link', { name: '案例' }).click();
    await page.getByRole('button', { name: '零售' }).click();
    await page.getByRole('link', { name: /案例/ }).first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}`,
      `3 passed (320, 768, 1440)
overflow values=[0,0,0]
失败边界：只截静态首页不能证明筛选、详情和触控路径可用`,
    ),
    example(
      '自动扫描后人工完成键盘与错误播报走查',
      'shell',
      `pnpm exec axe http://127.0.0.1:4173 --tags wcag2a,wcag2aa --exit
printf '%s\\n' 'manual: Tab to menu, Esc close, Tab to filter, Enter submit empty form' \\
  'expect: focus returns, error summary announced, first invalid field focused'
node scripts/assert-focus.mjs --steps artifacts/manual-a11y.json`,
      `axe violations=0
manual steps=4 passed=4
error summary announced=true firstInvalidFocused=true
失败边界：axe 通过但 Tab 顺序、焦点归还或 aria-live 失败时仍不放行`,
    ),
    undefined,
    example(
      '沿数据流检查 Studio 前端秘密和用户隐私',
      'javascript',
      `const forbidden = [
  /sk_live_[A-Za-z0-9]+/,
  /crm_api_key\\s*[:=]/i,
  /localStorage\\.setItem\\(['"]email['"],/,
];
const assets = ['dist/app.js', 'dist/vendor.js'];
for (const asset of assets) {
  const source = readFileSync(asset, 'utf8');
  const hits = forbidden.filter((rule) => rule.test(source));
  console.log(asset + ' secretHits=' + hits.length);
  if (hits.length) process.exitCode = 1;
}`,
      `dist/app.js secretHits=0
dist/vendor.js secretHits=0
失败边界：前端包出现真实 API key 或完整邮箱持久化时构建失败并轮换秘密`,
    ),
  ],
  [
    example(
      '用多阶段 Dockerfile 只把构建产物放入运行镜像',
      'dockerfile',
      `FROM node:22.11-alpine AS build
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm test

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf`,
      `docker build -t studio-web:r27 .
build stage: tests PASS
runtime image contains dist and nginx only
失败边界：构建参数含令牌、运行阶段包含 node_modules 或源码时镜像门禁失败`,
    ),
    example(
      '按文件稳定性设置 immutable 与 HTML 短缓存',
      'nginx',
      `location ~* \\.(js|css|woff2|png)$ {
  add_header Cache-Control "public, max-age=31536000, immutable";
  try_files $uri =404;
}
location = /index.html {
  add_header Cache-Control "no-cache, no-store, must-revalidate";
  try_files $uri =404;
}
location /api/ {
  proxy_pass http://studio-api:8080/;
  proxy_read_timeout 10s;
}`,
      `GET /assets/app-8f31.js -> cache-control immutable
GET /index.html -> no-cache
失败边界：HTML 长缓存会继续引用已删除资源；旧版资源文件被提前清理会白屏`,
    ),
    example(
      'CI 在固定提交上执行构建、测试和预算检查',
      'yaml',
      `jobs:
  studio:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10.15.0 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - run: pnpm exec playwright test
      - run: node scripts/check-budget.mjs dist
      - uses: actions/upload-artifact@v4
        with: { name: studio-dist, path: dist }`,
      `build=PASS test=PASS e2e=PASS
LCP=2.1s CLS=0.03 overflow=0
artifact=studio-dist commit=8a72c1d
失败边界：预算或 E2E 失败时不得上传可部署制品，避免测试版本与发布版本分叉`,
    ),
    undefined,
    example(
      '发布故障时先回滚入口文件再验证资源版本',
      'shell',
      `kubectl rollout undo deployment/studio-web
kubectl rollout status deployment/studio-web --timeout=120s
ENTRY=$(curl -fsS "$BASE/index.html")
ASSET=$(printf '%s' "$ENTRY" | grep -o '/assets/app-[a-z0-9]*\\.js' | head -1)
curl -fsS -o /dev/null -w '%{http_code}\\n' "$BASE$ASSET"
curl -fsS "$BASE/healthz"`,
      `rollout undo: previous revision active
asset /assets/app-8f31.js -> 200
healthz=ok
失败边界：入口回滚但旧资源 404 算未恢复；必须同时保留上一版本静态资源`,
    ),
  ],
  [
    example(
      '演练 JavaScript、CSS 和主图故障后的页面可读性',
      'typescript',
      `test('studio remains readable when assets fail', async ({ page }) => {
  await page.route('**/assets/*.css', (route) => route.abort());
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Studio/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '联系' })).toHaveAttribute('href', 'mailto:hello@studio.test');
  const images = await page.locator('img').count();
  expect(images).toBeGreaterThanOrEqual(0);
});`,
      `1 passed
headingVisible=true mailtoFallback=true
pageerror=0
失败边界：主图、CSS 或 JS 任一资源失败导致整个页面空白时降级设计不合格`,
    ),
    example(
      '表单依赖故障时保留草稿并显示备用联系路径',
      'typescript',
      `async function submitOrGuide(input: InquiryInput) {
  try {
    const response = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Idempotency-Key': input.requestId },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error('inquiry-unavailable');
    return { state: 'success' as const };
  } catch {
    return {
      state: 'fallback' as const,
      message: '提交暂不可用，内容已保留',
      actions: ['retry', 'copy-email', 'call'],
    };
  }
}`,
      `{"state":"fallback","message":"提交暂不可用，内容已保留","actions":["retry","copy-email","call"]}
失败边界：失败时清空表单或只显示“出错了”时用户无法继续咨询`,
    ),
    example(
      '检测 HTML 与哈希资源版本混用',
      'shell',
      `HTML=$(curl -fsS "$BASE/index.html")
ASSET=$(printf '%s' "$HTML" | grep -o '/assets/app-[a-f0-9]*\\.js' | head -1)
HASH=$(sha256sum "dist\${ASSET}" | cut -d' ' -f1)
REMOTE=$(curl -fsS "$BASE$ASSET" | sha256sum | cut -d' ' -f1)
test "$HASH" = "$REMOTE" && echo 'version-match'
test -z "$(printf '%s' "$HTML" | grep -o '/assets/app-[a-f0-9]*\\.js' | sort -u | tail -n +2)"`,
      `asset=/assets/app-8f31.js
version-match
single-entry-asset=true
失败边界：HTML 引用旧资源但 CDN 内容已替换时哈希不一致，立即停止缓存刷新`,
    ),
    example(
      '演练回滚决定并保存业务恢复证据',
      'shell',
      `START=$(date +%s)
kubectl rollout undo deployment/studio-web
kubectl rollout status deployment/studio-web --timeout=120s
curl -fsS "$BASE/healthz"
curl -fsS -X POST "$BASE/api/inquiries" -H 'Idempotency-Key: rollback-smoke' \\
  -d '{"name":"回滚验证","email":"smoke@example.com","message":"验证回滚后的咨询入口可用"}' \\
  -o /tmp/inquiry.json -w '%{http_code}\\n'
printf 'rollbackSeconds=%s requestId=%s\\n' "$(($(date +%s)-START))" "$(jq -r .requestId /tmp/inquiry.json)"`,
      `deployment rolled back and ready
healthz=ok inquiryHttp=201
rollbackSeconds=74 requestId=rb-42
失败边界：健康检查通过但咨询接口失败时仍视为未恢复，必须继续回滚或切维护页`,
    ),
    example(
      '用决策记录说明回滚门槛和负责人',
      'json',
      `{
  "incident": "studio-2026-11-24",
  "trigger": "inquiry error rate above 5 percent for 3 minutes",
  "rollbackOwner": "release-owner",
  "decisionOwner": "brand-owner",
  "rollbackAction": "restore previous index and immutable assets",
  "successEvidence": ["healthz 200", "asset hash match", "inquiry smoke 201"],
  "postRollbackChecks": ["submission smoke", "analytics event", "draft retention"]
}`,
      `trigger=errorRate>5% for 3m rollbackOwner=release-owner
successEvidence=3 postRollbackChecks=3
失败边界：没有明确负责人、成功证据或业务通知时不能宣布回滚完成`,
    ),
  ],
];

const PULSE_EXAMPLES: ProjectExampleGrid = [
  [
    example(
      '把运营决策触发条件写成驾驶舱任务卡',
      'javascript',
      `const decisions = [
  { actor: '值班运营', trigger: '负面声量 5 分钟翻倍', action: '定位来源和原始证据' },
  { actor: '品牌经理', trigger: '竞品涨幅超过 30%', action: '比较话题和渠道' },
  { actor: '值班工程师', trigger: '采集延迟超过 60 秒', action: '暂停使用陈旧数据并排障' },
];
for (const item of decisions) {
  console.log([item.actor, item.trigger, item.action].join(' | '));
}`,
      `值班运营 | 负面声量 5 分钟翻倍 | 定位来源和原始证据
品牌经理 | 竞品涨幅超过 30% | 比较话题和渠道
失败边界：运营无法从数字回到原始证据时，实时大屏只是装饰`,
    ),
    example(
      '把热点、证据和动作固定在同一观察对象',
      'typescript',
      `type Hotspot = {
  eventId: string;
  title: string;
  score: number;
  sources: { name: string; url: string; observedAt: string }[];
  actions: ('open-evidence'|'assign-owner'|'snooze')[];
};
const hotspot: Hotspot = {
  eventId: 'evt_01J8', title: '门店退款争议', score: 0.91,
  sources: [{ name: '微博', url: 'https://example.test/p/1', observedAt: '2026-11-24T03:20:00Z' }],
  actions: ['open-evidence','assign-owner'],
};
console.log(hotspot.title + ' sources=' + hotspot.sources.length + ' actions=' + hotspot.actions.length);`,
      `门店退款争议 sources=1 actions=2
失败边界：热点没有来源链接、事件 ID 或可执行动作时不得进入运营列表`,
    ),
    undefined,
    example(
      '把权限映射到证据、导出和确认动作',
      'javascript',
      `const matrix = {
  OPERATOR: ['view-hotspot', 'open-evidence', 'assign-owner'],
  ANALYST: ['view-hotspot', 'open-evidence', 'export-snapshot'],
  ENGINEER: ['view-source-health', 'pause-source', 'replay-events'],
};
for (const [role, actions] of Object.entries(matrix)) {
  console.log(role + '=' + actions.join(','));
}
const denied = !matrix.OPERATOR.includes('export-snapshot');
console.log('operator-export-denied=' + denied);`,
      `OPERATOR=view-hotspot,open-evidence,assign-owner
ANALYST=view-hotspot,open-evidence,export-snapshot
operator-export-denied=true
失败边界：只隐藏导出按钮而接口不校验权限时，权限测试失败`,
    ),
    example(
      '冻结 Pulse 首版产品边界',
      'yaml',
      `release: pulse-mvp
must:
  - live-hotspots
  - source-health
  - evidence-drawer
  - operator-assignment
later:
  - sentiment-model-v2
  - alert-rules-builder
excluded:
  - automatic-public-response
  - multi-tenant-billing
gate:
  decision: every-screen-has-owner-and-evidence
  stale-data-warning: required`,
      `must=4 later=2 excluded=2
PASS every screen action maps to a decision and evidence path
失败边界：自动回复没有人工确认、审计与撤回方案时不能进入首版`,
    ),
  ],
  [
    example(
      '用一条观察链路定义 Pulse MVP',
      'yaml',
      `flow:
  sources: [weibo, news, forum]
  normalize: canonical-event
  deduplicate: source-external-id
  aggregate: hot-score-5m
  stream: sse-hotspot-feed
  operator:
    - inspect-evidence
    - assign-owner
  evidence:
    - event-id
    - source-url
    - observed-at`,
      `sources=3 stages=5 operatorActions=2
PASS only one observation chain in MVP
失败边界：首版同时加入模型训练、复杂告警和自动回复时范围审查失败`,
    ),
    example(
      '用时间和失败条件验收实时探测结果',
      'gherkin',
      `Feature: Pulse 实时热点
  Scenario: 新事件在预算内进入驾驶舱
    Given 三个来源持续上报同一事件
    When 首个来源事件发生 8 秒
    Then 热点聚合结果可见
    And 页面显示数据截至时间
    And 原始证据链接可打开
  Scenario: 来源中断
    Given 最近事件超过 60 秒
    Then 页面标记 stale=true
    And 不显示“实时更新中”`,
      `2 scenarios (2 passed)
firstVisible=8s staleAt=61s staleFlag=true
失败边界：数据中断仍显示实时状态会误导运营，验收失败`,
    ),
    example(
      '把首屏与实时流分成两个性能时间轴',
      'javascript',
      `const budget = {
  initial: { lcpMs: 2500, hydrationMs: 1200 },
  realtime: { eventToScreenP95Ms: 8000, heartbeatMs: 15000, staleAfterMs: 60000 },
};
const observed = {
  initial: { lcpMs: 2100, hydrationMs: 980 },
  realtime: { eventToScreenP95Ms: 6400, heartbeatMs: 15000, staleAfterMs: 61000 },
};
for (const area of ['initial','realtime']) {
  console.log(area + '=' + JSON.stringify(budget[area]) + ' observed=' + JSON.stringify(observed[area]));
}`,
      `initial={"lcpMs":2500,"hydrationMs":1200} observed={"lcpMs":2100,"hydrationMs":980}
realtime={"eventToScreenP95Ms":8000} observed={"eventToScreenP95Ms":6400}
失败边界：首屏达标但事件延迟或 stale 标记失败时实时体验仍不合格`,
    ),
    example(
      '让图表、实时更新和筛选都能被键盘与读屏使用',
      'typescript',
      `test('pulse chart has a text alternative', async ({ page }) => {
  await page.goto('/');
  const chart = page.getByRole('img', { name: /事件趋势/ });
  await expect(chart).toBeVisible();
  await page.getByRole('button', { name: '查看数据表' }).click();
  const table = page.getByRole('table', { name: '事件趋势数据' });
  await expect(table).toBeVisible();
  await page.getByRole('status').filter({ hasText: '已连接' }).waitFor();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '暂停实时更新' })).toBeFocused();
});`,
      `1 passed
chartName=事件趋势 dataTableVisible=true liveRegion=已连接
失败边界：图表只靠颜色或鼠标悬浮、实时插入不播报时无障碍验收失败`,
    ),
    undefined,
  ],
  [
    example(
      '按观察对象定义 Pulse 资源与命令',
      'yaml',
      `paths:
  /hotspots:
    get: { description: cursor-paginated hotspot list }
  /hotspots/{eventId}:
    get: { description: evidence and source health }
  /hotspots/{eventId}/assignments:
    post: { description: assign owner, requires idempotency-key }
  /stream/hotspots:
    get: { description: SSE with Last-Event-ID resume }
  /sources/health:
    get: { description: collection lag and error state }`,
      `resources=4 commands=1
GET /hotspots has cursor and no side effects
POST assignments requires Idempotency-Key
失败边界：把暂停来源、分配负责人和查询列表都做成 GET 时契约评审失败`,
    ),
    example(
      '用 cursor 与 Last-Event-ID 分别恢复历史和实时流',
      'shell',
      `curl -fsS "$BASE/hotspots?cursor=eyJvIjoyMH0&limit=20" | jq '{items:.items|length,next:.nextCursor}'
curl -N --max-time 5 "$BASE/stream/hotspots" \\
  -H 'Last-Event-ID: 01J8V6M8R2' | head -4`,
      `{"items":20,"nextCursor":"eyJvIjo0MH0="}
id: 01J8V6M8S0
event: hotspot
data: {"eventId":"evt_02","score":0.82}
失败边界：用 cursor 恢复 SSE 会漏事件；断线必须带 Last-Event-ID 续传`,
    ),
    example(
      '独立解析一条 SSE 帧并保留事件身份',
      'javascript',
      `const frame = [
  'id: 01J8V6M8R2',
  'event: hotspot',
  'retry: 3000',
  'data: {"eventId":"evt_01","score":0.91,"title":"门店退款争议"}',
  '',
].join('\\n');
const parsed = Object.fromEntries(
  frame.trim().split('\\n').map((line) => {
    const index = line.indexOf(':');
    return [line.slice(0, index), line.slice(index + 1).trim()];
  }),
);
console.log(parsed.id, parsed.event, JSON.parse(parsed.data).score, parsed.retry);`,
      `01J8V6M8R2 hotspot 0.91 3000
失败边界：空行帧边界、id 或 data JSON 解析失败时必须断开并重连，不能静默丢事件`,
    ),
    undefined,
    example(
      '把服务端权威数据与客户端交互状态拆开',
      'typescript',
      `type ServerState = { sequence: bigint; hotspots: Map<string, Set<string>> };
type ClientState = { selectedId: string|null; paused: boolean; connection: 'live'|'retrying'|'offline' };
const server: ServerState = {
  sequence: 42n,
  hotspots: new Map([['evt_01', new Set(['weibo','news'])]]),
};
const client: ClientState = { selectedId: 'evt_01', paused: false, connection: 'live' };
console.log(JSON.stringify({ sequence: String(server.sequence), sources: [...server.hotspots.get('evt_01')!], ...client }));`,
      `{"sequence":"42","sources":["weibo","news"],"selectedId":"evt_01","paused":false,"connection":"live"}
失败边界：客户端不能自行把热度固定为权威值；暂停只影响展示，不能停止服务端游标`,
    ),
  ],
  [
    example(
      '用来源与外部标识组成事件唯一身份',
      'sql',
      `CREATE TABLE pulse_event (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  external_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  canonical_url text NOT NULL,
  payload_hash text NOT NULL,
  UNIQUE (source, external_id)
);

INSERT INTO pulse_event(source,external_id,observed_at,canonical_url,payload_hash)
VALUES ('weibo','post-9001',now(),'https://example.test/p/9001','sha256:abc')
ON CONFLICT (source,external_id) DO NOTHING;`,
      `first insert=1 duplicate insert=0
event identity=(weibo,post-9001)
失败边界：只用正文 hash 去重会把不同来源的独立证据误合并`,
    ),
    example(
      '用时间范围、来源和排序建立热度查询索引',
      'sql',
      `CREATE INDEX idx_event_source_observed
ON pulse_event (source, observed_at DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT source, count(*) AS events
FROM pulse_event
WHERE observed_at >= now() - interval '5 minutes'
  AND source IN ('weibo','news','forum')
GROUP BY source
ORDER BY events DESC;`,
      `Index Scan using idx_event_source_observed
rows=3 actual time=4.2..7.8ms
Buffers: shared hit=28
失败边界：查询无时间范围会扫描历史全表，上线前必须限制最大窗口`,
    ),
    example(
      '按事件流与历史列表分别设置保留策略',
      'sql',
      `CREATE TABLE event_stream (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE hotspot_history (
  event_id uuid PRIMARY KEY,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  final_score numeric(6,4) NOT NULL
);
DELETE FROM event_stream WHERE created_at < now() - interval '2 hours';
DELETE FROM hotspot_history WHERE last_seen_at < now() - interval '180 days';`,
      `event_stream retention=2h
hotspot_history retention=180d
rows deleted: stream=1842 history=0
失败边界：直接删除历史事实前必须确认已归档，运营审计不能被短期流保留策略影响`,
    ),
    example(
      '先补来源唯一键再切换事件写入',
      'sql',
      `ALTER TABLE event_stream ADD COLUMN event_key text;
UPDATE event_stream
SET event_key = source || ':' || external_id
WHERE event_key IS NULL;
CREATE UNIQUE INDEX CONCURRENTLY uq_event_key
ON event_stream (event_key);
SELECT count(*) AS duplicates
FROM (
  SELECT event_key FROM event_stream GROUP BY event_key HAVING count(*) > 1
) d;`,
      `rows updated=184203
unique index uq_event_key ready
duplicates=0
失败边界：重复键大于 0 时停止部署，先合并事件证据并保留历史来源，而不是直接删行`,
    ),
    example(
      '缓存键包含来源版本并在规则变化时主动失效',
      'typescript',
      `const key = 'pulse:hotspots:5m:' + sourceVersion + ':' + windowStart;
await redis.set(key, JSON.stringify(rows), { EX: 30 });
await redis.sAdd('pulse:cache-keys', key);

async function invalidateSource(source: string) {
  const keys = await redis.sMembers('pulse:cache-keys');
  const owned = keys.filter((item) => item.includes(source));
  if (owned.length) await redis.del(owned);
  console.log('invalidated=' + owned.length);
}
await invalidateSource('weibo');`,
      `cache key=pulse:hotspots:5m:v7:2026-11-24T03:20Z
invalidated=2
失败边界：规则版本变化但缓存键不变时继续返回旧热度，必须提升 sourceVersion`,
    ),
  ],
  [
    example(
      '用运行边界组织 Pulse 前端、事件服务与采集器',
      'shell',
      `find . -maxdepth 2 -type d | sort
test -d apps/web && test -d services/pulse-api && test -d services/collector
rg -n "services/collector/src" apps/web/src && exit 1
printf 'web->collector-imports=0\\n'`,
      `apps/web
services/collector
services/pulse-api
web->collector-imports=0
失败边界：前端直接 import 服务端数据库或采集器内部实现时边界检查失败`,
    ),
    example(
      '只向客户端组件序列化可展示数据',
      'typescript',
      `type PulseCardData = { id: string; title: string; score: number; sourceCount: number };
function toCard(model: PulseModel): PulseCardData {
  return { id: model.id, title: model.title, score: model.score, sourceCount: model.sources.length };
}
const card = toCard({
  id: 'evt_01', title: '门店退款争议', score: 0.91,
  sources: [{ token: 'secret', raw: 'internal' }],
} as PulseModel);
console.log(JSON.stringify(card));`,
      `{"id":"evt_01","title":"门店退款争议","score":0.91,"sourceCount":1}
失败边界：把数据库连接、秘密或完整内部模型跨 RSC 边界传给客户端会泄露并破坏序列化`,
    ),
    example(
      '让 Pulse API 先暴露健康与稳定资源契约',
      'python',
      `from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Hotspot(BaseModel):
    event_id: str
    title: str
    score: float

@app.get("/health/ready")
def ready() -> dict[str, str]:
    return {"status": "UP", "cursor": "42"}

@app.get("/hotspots", response_model=list[Hotspot])
def hotspots() -> list[Hotspot]:
    return [Hotspot(event_id="evt_01", title="门店退款争议", score=0.91)]`,
      `GET /health/ready -> {"status":"UP","cursor":"42"}
GET /hotspots -> [{"event_id":"evt_01","title":"门店退款争议","score":0.91}]
失败边界：健康接口在数据库不可用时仍返回 UP 会误导就绪探针`,
    ),
    undefined,
    example(
      '发送一次事件并验证流、聚合与证据端到端',
      'shell',
      `curl -fsS -X POST localhost:9001/events -H 'Content-Type: application/json' \\
  -d '{"source":"weibo","externalId":"post-9001","title":"门店退款争议"}'
until curl -fsS localhost:8080/hotspots/evt_01 | jq -e '.sources|length>0'; do sleep 1; done
curl -N --max-time 3 localhost:8080/stream/hotspots | grep -m1 'event: hotspot'
curl -fsS localhost:8080/hotspots/evt_01 | jq -e '.evidence[0].url'`,
      `accepted event=evt_01
aggregate sources=1
stream event=hotspot
evidence=https://example.test/p/9001
失败边界：事件入库但 60 秒内未形成聚合或没有证据链接时环境验收失败`,
    ),
  ],
  [
    example(
      '把查询、缓存和流式发送分层处理',
      'typescript',
      `async function loadHotspots(cursor: string) {
  const cacheKey = 'hotspots:' + cursor;
  const cached = await cache.get(cacheKey);
  if (cached) return { source: 'cache', page: JSON.parse(cached) };
  const page = await repository.list(cursor, 20);
  await cache.set(cacheKey, JSON.stringify(page), { EX: 15 });
  return { source: 'db', page };
}
const result = await loadHotspots('0');
console.log(result.source + ' items=' + result.page.items.length);`,
      `cache items=20
失败边界：SSE 发送不能同步等待慢数据库；缓存必须可失效并有版本，不能替代事实源`,
    ),
    example(
      '在进入热点聚合前按事件身份去重',
      'sql',
      `INSERT INTO normalized_event(event_key, source, external_id, observed_at)
VALUES ('weibo:post-9001', 'weibo', 'post-9001', now())
ON CONFLICT (event_key) DO UPDATE
SET observed_at=GREATEST(normalized_event.observed_at, EXCLUDED.observed_at)
RETURNING event_key, observed_at;

SELECT count(*) FROM normalized_event WHERE event_key='weibo:post-9001';`,
      `RETURNING event_key=weibo:post-9001
count=1 after three duplicate reports
失败边界：重复采集若在聚合后才去重，热点分数会被人为放大`,
    ),
    example(
      '完整处理 SSE 鉴权、心跳和连接关闭',
      'javascript',
      `async function stream(req, res) {
  const user = await authenticate(req);
  if (!user) return res.status(401).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const heartbeat = setInterval(() => res.write(': heartbeat\\n\\n'), 15000);
  const close = () => { clearInterval(heartbeat); unsubscribe(); res.end(); };
  const unsubscribe = bus.subscribe((event) => {
    res.write('id: ' + event.id + '\\n');
    res.write('event: hotspot\\n');
    res.write('data: ' + JSON.stringify(event) + '\\n\\n');
  });
  req.on('close', close);
  req.on('error', close);
}`,
      `HTTP 200 text/event-stream
heartbeat every 15s cursor=01J8V6M8R2
disconnect unsubscribes=true
失败边界：鉴权失败先关闭、不建订阅；断线未清理监听会导致连接泄漏`,
    ),
    undefined,
    example(
      '让错误码和指标直接指向恢复动作',
      'javascript',
      `const recovery = {
  SOURCE_STALE: 'show-stale-badge-and-pause-auto-refresh',
  CURSOR_EXPIRED: 'reload-first-page-and-reset-last-event-id',
  SSE_OVERLOADED: 'disconnect-slow-consumer-and-reconnect-with-backoff',
  CACHE_UNAVAILABLE: 'fallback-database-with-bounded-concurrency',
};
for (const [code, action] of Object.entries(recovery)) {
  console.log('metric pulse_recovery_total{code="' + code + '"} action=' + action);
}`,
      `metric pulse_recovery_total{code="SOURCE_STALE"} action=show-stale-badge-and-pause-auto-refresh
metric pulse_recovery_total{code="SSE_OVERLOADED"} action=disconnect-slow-consumer-and-reconnect-with-backoff
失败边界：只有错误日志而没有恢复动作和指标时，值班人员无法判断系统状态`,
    ),
  ],
  [
    example(
      '首屏由服务端提供稳定上下文和截止时间',
      'typescript',
      `export default async function DashboardPage() {
  const initial = await api.getHotspots({ limit: 20, timeoutMs: 1200 });
  return (
    <Dashboard
      initialItems={initial.items}
      initialCursor={initial.nextCursor}
      observedAt={initial.observedAt}
      connection="connecting"
    />
  );
}
console.log('server-rendered items=20 observedAt=2026-11-24T03:20:00Z');`,
      `server-rendered items=20 observedAt=2026-11-24T03:20:00Z
connection=connecting
失败边界：服务端等待无限重试会拖垮首屏；客户端必须显示数据截至时间`,
    ),
    example(
      '把 Pulse 筛选与当前选择保存在 URL',
      'javascript',
      `const url = new URL('https://pulse.test/?source=weibo&window=5m&selected=evt_01');
url.searchParams.set('window', '30m');
url.searchParams.set('selected', 'evt_02');
const state = {
  source: url.searchParams.get('source'),
  window: url.searchParams.get('window'),
  selected: url.searchParams.get('selected'),
};
console.log(url.pathname + url.search);
console.log(JSON.stringify(state));`,
      `/?source=weibo&window=30m&selected=evt_02
{"source":"weibo","window":"30m","selected":"evt_02"}
失败边界：刷新后筛选丢失或用内部数组索引标识热点时，用户无法恢复上下文`,
    ),
    example(
      '实时插入按事件 ID 与顺序双重去重',
      'typescript',
      `const items = new Map<string, { id: string; sequence: bigint; title: string }>();
function upsert(event: { id: string; sequence: bigint; title: string }) {
  const existing = items.get(event.id);
  if (existing && existing.sequence >= event.sequence) return false;
  items.set(event.id, event);
  return true;
}
console.log('first=' + upsert({ id: 'evt_01', sequence: 41n, title: '门店退款争议' }));
console.log('duplicate=' + upsert({ id: 'evt_01', sequence: 41n, title: '门店退款争议' }));
console.log('newer=' + upsert({ id: 'evt_01', sequence: 42n, title: '门店退款处理进展' }));`,
      `first=true
duplicate=false
newer=true
失败边界：只按标题去重会合并不同事件；只按 ID 接受旧包会回退内容`,
    ),
    undefined,
    example(
      '在窄屏和键盘下完成查看证据与分配负责人',
      'typescript',
      `test('pulse operator action at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/?selected=evt_01');
  await page.getByRole('button', { name: '查看证据' }).click();
  await expect(page.getByRole('dialog', { name: '事件证据' })).toBeVisible();
  await page.getByRole('button', { name: '分配负责人' }).click();
  await page.getByLabel('负责人').fill('林青');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('已分配');
});`,
      `1 passed
evidenceVisible=true assigned=林青 overflow=0
失败边界：移动端对话框遮住关闭按钮、负责人输入无法键盘选择时验收失败`,
    ),
  ],
  [
    example(
      '用契约测试固定 Pulse 字段、错误码和游标',
      'shell',
      `pnpm contract:test --contract contracts/pulse.openapi.yaml \\
  --case hotspots-page --case stale-source --case sse-overloaded
node scripts/check-contract.mjs artifacts/pulse-contract.json
jq -e '.cases[] | select(.failed==true) | length==0' artifacts/pulse-contract.json`,
      `cases=3 passed=3 failed=0
STALE_SOURCE -> 200 stale=true retryAfterMs=15000
SSE_OVERLOADED -> 503 code=SSE_OVERLOADED
失败边界：契约只覆盖成功热点列表，遗漏 stale 与断流恢复时门禁失败`,
    ),
    example(
      '跨租户和跨来源验证证据读取授权',
      'shell',
      `curl -sS -o /tmp/a.json -w '%{http_code}' "$BASE/hotspots/evt_tenant_b" \\
  -H "Authorization: Bearer $TENANT_A_TOKEN"
printf '\\n'
curl -sS -o /tmp/b.json -w '%{http_code}' "$BASE/hotspots/evt_01/evidence?source=private" \\
  -H "Authorization: Bearer $ANALYST_TOKEN"
printf '\\n'
jq -r '.code' /tmp/b.json`,
      `404
403
SOURCE_ACCESS_DENIED
失败边界：调用方来自内网而跳过租户或来源过滤时安全测试失败`,
    ),
    example(
      '断线与重启后用 Last-Event-ID 恢复且不错序',
      'javascript',
      `let lastEventId = sessionStorage.getItem('pulse:last-event-id') ?? '0';
function connect() {
  const source = new EventSource('/stream/hotspots?id=' + encodeURIComponent(lastEventId));
  source.addEventListener('hotspot', (event) => {
    const parsed = JSON.parse(event.data);
    if (BigInt(parsed.sequence) <= BigInt(lastEventId)) return;
    lastEventId = parsed.sequence;
    sessionStorage.setItem('pulse:last-event-id', lastEventId);
    render(parsed);
  });
  source.onerror = () => {
    source.close();
    setTimeout(connect, 3000);
  };
}`,
      `connected with Last-Event-ID=42
received sequence=43 then 44
reconnect resumed at 44
失败边界：断线从 0 重放会重复展示；跳过旧序号会丢失事件，两者都不合格`,
    ),
    undefined,
    example(
      '把慢消费者、延迟和安全结论写成证据',
      'shell',
      `k6 run scripts/pulse-realtime.js --vus 200 --duration 3m
node scripts/check-slo.mjs \\
  --p95 8000 --stale-after 60000 \\
  --summary artifacts/pulse-k6.json
curl -sS "$BASE/hotspots/evt_tenant_b" -H "Authorization: Bearer $TENANT_A_TOKEN" -o /dev/null -w '%{http_code}\\n'`,
      `p95=6120ms tail=11800ms staleAfter=60s
slowConsumersDisconnected=7 securityStatus=404
失败边界：只报告平均事件延迟或安全例返回 200 时不得发布`,
    ),
  ],
  [
    example(
      '为 Pulse Web、API 和采集器分别构建可追溯制品',
      'yaml',
      `strategy:
  matrix:
    job: [web, api, collector]
steps:
  - run: pnpm --filter pulse-\${{ matrix.job }} test
  - run: docker build -t registry.local/pulse-\${{ matrix.job }}:\${{ github.sha }} ./\${{ matrix.job }}
  - run: docker push registry.local/pulse-\${{ matrix.job }}:\${{ github.sha }}
  - run: syft registry.local/pulse-\${{ matrix.job }}:\${{ github.sha }} -o spdx-json=\${{ matrix.job }}.json`,
      `3 images built commit=5f7d2a1
web/api/collector digests recorded
SBOM signatures=3
失败边界：三者共用同一镜像或采集器未经测试即发布时流水线阻断`,
    ),
    example(
      '把 ready 与 live 探针绑定不同依赖状态',
      'yaml',
      `readinessProbe:
  httpGet: { path: /health/ready, port: 8080 }
  periodSeconds: 5
  failureThreshold: 3
livenessProbe:
  httpGet: { path: /health/live, port: 8080 }
  periodSeconds: 15
  failureThreshold: 3
env:
  - name: DATABASE_URL
    valueFrom: { secretKeyRef: { name: pulse-db, key: url } }
  - name: REDIS_URL
    valueFrom: { secretKeyRef: { name: pulse-redis, key: url } }`,
      `database down: readiness 503 liveness 200
redis recovered: readiness 200 within 10s
失败边界：数据库短暂不可用不应触发 liveness 重启；secret 不得写入 ConfigMap`,
    ),
    example(
      '沿一条实时事件记录 HTTP、聚合与 SSE span',
      'javascript',
      `async function handle(event, traceparent) {
  const parent = propagation.extract(context.active(), { traceparent });
  return tracer.startActiveSpan('pulse.aggregate', { links: [{ context: parent }] }, async (span) => {
    span.setAttributes({ 'pulse.source': event.source, 'pulse.event_id': event.id });
    const score = await scoreEvent(event);
    span.addEvent('hotspot.scored', { score, sourceCount: event.sources.length });
    await stream.publish({ ...event, score });
    console.log('trace=' + span.spanContext().traceId + ' score=' + score);
    span.end();
  });
}`,
      `trace=4bf92f3577b34da6 score=0.91 sourceCount=2
SSE span parent=4bf92f3577b34da6
失败边界：Kafka 或 SSE 段新建无父 trace 时，跨服务延迟无法定位`,
    ),
    undefined,
    example(
      '发布前兼容契约并排空旧 SSE 连接',
      'shell',
      `kubectl apply -f k8s/pulse-v28.yaml
kubectl rollout status deployment/pulse-api --timeout=180s
kubectl annotate deployment/pulse-api drain-start="$(date -u +%FT%TZ)" --overwrite
sleep 20
kubectl get pods -l app=pulse-api -o wide
curl -fsS "$BASE/health/ready" | jq -e '.schema=="v28" and .activeClients<100'`,
      `rollout complete schema=v28 activeClients=87
old connections drained=true
失败边界：强制 kill SSE 会丢失 Last-Event-ID 之后事件；必须让客户端可重连续传`,
    ),
    example(
      '回滚版本时同时核对契约、游标与缓存键',
      'shell',
      `kubectl rollout undo deployment/pulse-api
kubectl rollout status deployment/pulse-api --timeout=120s
curl -fsS "$BASE/hotspots?cursor=42" | jq -e '.contractVersion=="v27"'
redis-cli DEL pulse:hotspots:5m:v28:window
curl -fsS "$BASE/stream/hotspots" -H 'Last-Event-ID: 42' --max-time 3 | head -3`,
      `rollback complete contractVersion=v27
cache v28 evicted
stream resumes after event 42
失败边界：旧 API 无法解析新缓存/事件格式时必须先清缓存并停止新事件生产`,
    ),
  ],
  [
    example(
      '来源中断时显示陈旧数据和恢复路径',
      'typescript',
      `test('pulse marks stale source', async ({ page }) => {
  await page.route('**/sources/health', (route) => route.fulfill({
    json: { weibo: { status: 'stale', lagSeconds: 95 }, news: { status: 'healthy', lagSeconds: 2 } },
  }));
  await page.goto('/');
  await expect(page.getByText('微博数据截至 95 秒前')).toBeVisible();
  await expect(page.getByText('实时更新中')).toHaveCount(0);
  await page.getByRole('button', { name: '刷新来源状态' }).click();
});`,
      `1 passed
staleLabel=微博数据截至 95 秒前 liveLabelCount=0
失败边界：来源超时仍展示绿色实时状态会误导运营，测试必须失败`,
    ),
    example(
      'Redis 故障时用有界并发回源数据库',
      'typescript',
      `async function loadWithFallback() {
  try {
    return await redis.mget(hotspotKeys);
  } catch (error) {
    const gate = new Semaphore(8);
    const rows = await Promise.all(hotspotKeys.map((key) => gate.run(() => db.hotspot(key))));
    metrics.increment('pulse.redis.fallback');
    return rows;
  }
}
const rows = await loadWithFallback();
console.log('fallbackRows=' + rows.filter(Boolean).length);`,
      `fallbackRows=20
pulse.redis.fallback=1 databaseConcurrency<=8
失败边界：Redis 故障后无界回源会把数据库打满，必须限并发、设置超时和熔断`,
    ),
    undefined,
    example(
      '版本回滚时兼容旧 cursor 并处理连接',
      'typescript',
      `type CursorV27 = { offset: number };
type CursorV28 = { sequence: string };
function upgradeCursor(input: CursorV27 | CursorV28): CursorV28 {
  if ('sequence' in input) return input;
  if (!Number.isInteger(input.offset) || input.offset < 0) throw new Error('CURSOR_EXPIRED');
  return { sequence: String(input.offset) };
}
console.log(upgradeCursor({ offset: 42 }));
console.log(upgradeCursor({ sequence: '44' }));`,
      `{"sequence":"42"}
{"sequence":"44"}
失败边界：旧 cursor 无法升级时返回 CURSOR_EXPIRED 并重载首页，不能静默从 0 重复推送`,
    ),
    example(
      '答辩用运行图串起来源、聚合、流和恢复',
      'json',
      `{
  "flow": ["source", "normalize", "dedupe", "aggregate", "sse", "operator"],
  "guarantees": {
    "dedupe": "source+externalId unique",
    "recovery": "Last-Event-ID with bounded reconnect",
    "degradation": "stale badge and bounded cache fallback"
  },
  "evidence": ["event-to-screen p95 6.4s", "slow consumers 7", "stale at 61s"],
  "rejected": ["unbounded SSE queue", "cache as source of truth", "automatic public response"]
}`,
      `flowStages=6 guarantees=3 evidence=3 rejected=3
decision=keep-bounded-realtime-pipeline
失败边界：无法解释断线恢复、陈旧数据或慢消费者保护时架构答辩不通过`,
    ),
  ],
];

const TEAMFLOW_EXAMPLES: ProjectExampleGrid = [
  [
    example(
      '把组织、成员关系和撤权生命周期写成任务',
      'javascript',
      `const lifecycle = [
  { actor: 'ADMIN', event: 'invite-member', success: 'invite-pending', failure: 'invite-expired' },
  { actor: 'MEMBER', event: 'accept-invite', success: 'member-active', failure: 'tenant-mismatch' },
  { actor: 'LEAD', event: 'assign-task', success: 'audit-written', failure: 'role-denied' },
  { actor: 'ADMIN', event: 'remove-member', success: 'session-and-cache-revoked', failure: 'active-owner-conflict' },
];
for (const item of lifecycle) console.log([item.actor,item.event,item.success,item.failure].join(' | '));`,
      `ADMIN | invite-member | invite-pending | invite-expired
MEMBER | accept-invite | member-active | tenant-mismatch
LEAD | assign-task | audit-written | role-denied
失败边界：移除成员后仍能写任务，说明会话、缓存和授权检查至少有一层失效`,
    ),
    example(
      '用项目到任务的闭环定义协作最小单元',
      'typescript',
      `type TaskCommand = { workspaceId: string; projectId: string; title: string; assigneeId?: string };
function validate(command: TaskCommand, actor: { role: string; projectIds: string[] }) {
  if (actor.role === 'AUDITOR') return 'ROLE_READ_ONLY';
  if (!actor.projectIds.includes(command.projectId)) return 'PROJECT_MEMBERSHIP_REQUIRED';
  if (command.title.trim().length < 3) return 'TITLE_TOO_SHORT';
  return 'ACCEPT';
}
console.log(validate({ workspaceId:'ws_1',projectId:'p_1',title:'修复登录' }, { role:'MEMBER',projectIds:['p_1'] }));
console.log(validate({ workspaceId:'ws_1',projectId:'p_2',title:'修复登录' }, { role:'MEMBER',projectIds:['p_1'] }));`,
      `ACCEPT
PROJECT_MEMBERSHIP_REQUIRED
失败边界：创建任务、评论和通知必须共享同一工作区与项目归属，不能只校验登录状态`,
    ),
    undefined,
    example(
      '把跨租户与撤权场景写进角色流程',
      'javascript',
      `const checks = [
  { actor: 'MEMBER-A', target: 'task-B', expected: 404, reason: 'cross-tenant' },
  { actor: 'AUDITOR', target: 'task-A', action: 'update', expected: 403, reason: 'read-only' },
  { actor: 'LEAD', target: 'task-A', action: 'assign', expected: 200, reason: 'project-member' },
];
for (const check of checks) {
  console.log(check.actor + ' ' + check.action + ' ' + check.target + ' -> ' + check.expected + ' ' + check.reason);
}`,
      `MEMBER-A undefined task-B -> 404 cross-tenant
AUDITOR update task-A -> 403 read-only
LEAD assign task-A -> 200 project-member
失败边界：跨租户对象返回 403 并泄露存在性时也不合格，应统一对象不可见响应`,
    ),
    example(
      '冻结 TeamFlow 首版范围并保留审计闭环',
      'yaml',
      `release: teamflow-mvp
must: [auth, workspace, invite, project, task, comment, notification, audit]
later: [attachments, custom-roles, realtime-collaboration]
excluded: [plugin-market, microservice-split]
securityGates:
  cross-tenant-read: deny
  role-change-audit: required
  revoked-session-write: deny
  notification-outbox: required`,
      `must=8 later=3 excluded=2 securityGates=4
PASS MVP has one auditable collaboration loop
失败边界：首版没有租户隔离或审计能力时不得用“内测版”理由发布`,
    ),
  ],
  [
    example(
      '用协作闭环固定 TeamFlow MVP',
      'yaml',
      `flow:
  admin: [create-workspace, invite-member, assign-role]
  lead: [create-project, create-task, assign-task]
  member: [update-task-status, comment]
  auditor: [read-audit, filter-actions]
  system: [outbox-notification, revoke-cache-on-role-change]
evidence:
  - tenant_id
  - request_id
  - audit_id
  - outbox_event_id`,
      `actors=5 systemFlows=2 evidence=4
PASS every action has role tenant and audit evidence
失败边界：通知失败不阻塞任务创建；审计缺失则整个写操作验收失败`,
    ),
    example(
      '用角色与租户反例验收任务读取',
      'gherkin',
      `Feature: 跨租户任务隔离
  Scenario: 工作区 A 的成员读取工作区 B 任务
    Given MEMBER-A 属于 tenant-a 和 project-a
    And task-b 属于 tenant-b 和 project-b
    When MEMBER-A 请求 /workspaces/tenant-b/tasks/task-b
    Then 响应为 404 TASK_NOT_ACCESSIBLE
    And 响应正文不包含 tenant-b 名称
    And audit 不记录完整任务正文
  Scenario: AUDITOR 更新任务
    Then 响应为 403 ROLE_READ_ONLY`,
      `2 scenarios (2 passed)
crossTenant=404 TASK_NOT_ACCESSIBLE auditorUpdate=403 ROLE_READ_ONLY
失败边界：任一反例返回 200 或泄露其他租户名称时整组失败`,
    ),
    example(
      '用真实权限过滤查询验证任务列表 P95',
      'sql',
      `CREATE INDEX idx_task_scope_status_updated
ON task (tenant_id, workspace_id, project_id, status, updated_at DESC);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id,title,status,assignee_id,version
FROM task
WHERE tenant_id='tenant-a'
  AND workspace_id='ws_1'
  AND project_id='p_1'
  AND status IN ('TODO','DOING')
ORDER BY updated_at DESC
LIMIT 50;`,
      `Index Scan using idx_task_scope_status_updated
rows=42 actual time=0.082..0.141ms
Buffers: shared hit=12
失败边界：空表或省略 tenant_id 的查询不能作为 P95 300ms 证据`,
    ),
    example(
      '用 Outbox 唯一键验收通知最终送达与去重',
      'sql',
      `INSERT INTO outbox(event_id,event_key,event_type,payload)
VALUES ('evt_1','task:task_1:v5','TaskCompleted','{"taskId":"task_1"}')
ON CONFLICT (event_key) DO NOTHING;
INSERT INTO notification(event_id,recipient_id,status)
VALUES ('evt_1','user_2','QUEUED')
ON CONFLICT (event_id) DO NOTHING;
SELECT count(*) AS event_rows FROM outbox WHERE event_key='task:task_1:v5';
SELECT count(*) AS notification_rows FROM notification WHERE event_id='evt_1';`,
      `event_rows=1 notification_rows=1
first delivery=QUEUED duplicate delivery=noop
失败边界：通知允许最终送达，但重复消费产生两条未读或 Outbox 没有唯一键时不通过`,
    ),
    example(
      '范围变更先评估角色、迁移和旧客户端影响',
      'javascript',
      `const change = {
  name: 'custom-role',
  changesAuthorization: true,
  migrationRequired: true,
  oldClientReadable: false,
};
const blockers = [];
if (change.changesAuthorization && !change.auditDesign) blockers.push('missing-audit-design');
if (change.migrationRequired && !change.rollbackPlan) blockers.push('missing-rollback-plan');
if (!change.oldClientReadable) blockers.push('old-client-break');
console.log(JSON.stringify({ ...change, blockers, decision: blockers.length ? 'REJECT' : 'ACCEPT' }));`,
      `{"name":"custom-role","blockers":["missing-audit-design","missing-rollback-plan","old-client-break"],"decision":"REJECT"}
失败边界：角色变化未说明缓存失效、审计和回填时不能进入首版`,
    ),
  ],
  [
    example(
      '用复数资源路径和 transition 命令固定团队 API',
      'yaml',
      `paths:
  /workspaces/{workspaceId}/projects: { get: {}, post: {} }
  /projects/{projectId}/tasks: { get: {}, post: {} }
  /tasks/{taskId}/transitions:
    post:
      description: TODO to DOING or DONE with role and version checks
  /workspaces/{workspaceId}/members: { get: {}, post: {} }
  /workspaces/{workspaceId}/audit-events: { get: {} }`,
      `resources=4 commands=1
POST transitions requires version and expectedState
GET audit-events is cursor paginated
失败边界：路径中没有 workspace 但仍接受客户端 tenant_id 时租户边界不清晰`,
    ),
    example(
      '租户上下文只从认证主体和成员关系解析',
      'java',
      `public RequestContext resolve(Principal principal, String workspaceId) {
  var membership = memberRepository.findActive(principal.userId(), workspaceId)
    .orElseThrow(() -> new AccessDeniedException("WORKSPACE_NOT_ACCESSIBLE"));
  return new RequestContext(
    membership.tenantId(),
    workspaceId,
    principal.userId(),
    membership.role(),
    UUID.randomUUID().toString()
  );
}
var context = resolve(userA, "ws_1");
System.out.println(context.tenantId() + ":" + context.role());`,
      `tenant-a:LEAD
user-not-member -> AccessDenied WORKSPACE_NOT_ACCESSIBLE
失败边界：客户端请求体中的 tenantId 只能用于对照，绝不能覆盖认证主体解析出的租户`,
    ),
    example(
      '把权限、版本和限流错误映射成稳定前端动作',
      'typescript',
      `type ApiError =
  | { status: 403; code: 'ROLE_READ_ONLY' }
  | { status: 404; code: 'TASK_NOT_ACCESSIBLE' }
  | { status: 409; code: 'TASK_VERSION_CONFLICT' }
  | { status: 429; code: 'RATE_LIMITED'; retryAfterMs: number };
function next(error: ApiError) {
  if (error.status === 409) return { action: 'reload-task' };
  if (error.status === 404) return { action: 'return-project' };
  if (error.status === 429) return { action: 'retry-later', waitMs: error.retryAfterMs };
  return { action: 'hide-write-controls' };
}
console.log(next({ status: 409, code: 'TASK_VERSION_CONFLICT' }));`,
      `{"action":"reload-task"}
失败边界：把所有权限错误显示成网络失败会诱导用户反复点击并扩大审计噪声`,
    ),
    example(
      '用幂等键和版本号固定并发写契约',
      'yaml',
      `paths:
  /tasks/{taskId}:
    patch:
      parameters:
        - { name: Idempotency-Key, in: header, required: true }
        - { name: If-Match, in: header, required: true }
      responses:
        '200': { description: updated with new version }
        '409': { description: version conflict }
        '422': { description: validation failure }
  /tasks/{taskId}/transitions:
    post:
      parameters:
        - { name: If-Match, in: header, required: true }`,
      `PATCH task with If-Match="4" -> 200 version=5
replay same key and body -> 200 same version
stale If-Match="4" after version=5 -> 409 TASK_VERSION_CONFLICT
失败边界：缺省版本头或把冲突当成功后覆盖会破坏审计连续性`,
    ),
    example(
      '切换工作区时取消请求并清空旧租户缓存',
      'typescript',
      `async function switchWorkspace(nextId: string, state: WorkspaceState) {
  state.abortController.abort();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === 'workspace-data' });
  state.abortController = new AbortController();
  history.pushState({}, '', '/workspaces/' + nextId + '/projects');
  const projects = await api.projects(nextId, { signal: state.abortController.signal });
  state.currentWorkspaceId = nextId;
  state.projects = projects;
  console.log('workspace=' + nextId + ' projects=' + projects.length + ' oldCache=0');
}`,
      `workspace=ws_2 projects=4 oldCache=0
失败边界：切换失败时保留旧工作区并提示，不能把旧任务与新工作区标题混在一起`,
    ),
  ],
  [
    example(
      '让 tenant_id 进入所有关联表和外键关系',
      'sql',
      `CREATE TABLE workspace (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE project (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL,
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspace(tenant_id, id),
  PRIMARY KEY (tenant_id, workspace_id, id)
);
CREATE TABLE task (
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  id uuid PRIMARY KEY,
  FOREIGN KEY (tenant_id, workspace_id, project_id)
    REFERENCES project(tenant_id, workspace_id, id)
);`,
      `workspace pk=(tenant_id,id)
project fk=(tenant_id,workspace_id)
task fk=(tenant_id,workspace_id,project_id)
失败边界：只用 project_id 外键允许 task 指向另一租户项目，复合外键必须阻止`,
    ),
    example(
      '用唯一约束固定邀请与成员关系',
      'sql',
      `CREATE TABLE invitation (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX uq_member_active
ON membership (workspace_id, user_id)
WHERE status='ACTIVE';

INSERT INTO invitation(id,workspace_id,email,token_hash,status,expires_at)
VALUES ('inv_1','ws_1','lin@example.com','sha256:abc','PENDING',now()+interval '7 days');`,
      `invitation token unique=true
active membership unique=(workspace_id,user_id)
失败边界：重复接受邀请不能悄悄覆盖历史成员关系，必须返回已接受或创建新审计记录`,
    ),
    example(
      '用版本字段保护并发任务状态更新',
      'sql',
      `UPDATE task
SET status='DONE', version=version+1, updated_at=now()
WHERE tenant_id='tenant-a'
  AND project_id='p_1'
  AND id='task_1'
  AND version=4
  AND status='DOING'
RETURNING id,status,version;

UPDATE task
SET status='TODO', version=version+1
WHERE tenant_id='tenant-a' AND project_id='p_1' AND id='task_1'
  AND version=4 AND status='DOING'
RETURNING id,status,version;`,
      `task_1 DONE 5
second update: UPDATE 0
error=409 TASK_VERSION_CONFLICT currentVersion=5
失败边界：旧页面强行覆盖新状态时不得成功，前端应重新读取任务`,
    ),
    example(
      '审计与 Outbox 只允许追加写入',
      'sql',
      `CREATE TABLE audit_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  object_id uuid NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  sent_at timestamptz
);
REVOKE UPDATE, DELETE ON audit_log FROM app_rw;`,
      `audit insert=allowed audit update=denied audit delete=denied
outbox pending rows=1 completed rows=0
失败边界：业务请求能修改历史审计或删除 Outbox 时，事故调查与重放都失去可信证据`,
    ),
    example(
      '用回填和校验分阶段收紧 tenant_id',
      'sql',
      `ALTER TABLE task ADD COLUMN tenant_id uuid;
UPDATE task t
SET tenant_id=p.tenant_id
FROM project p
WHERE p.id=t.project_id AND t.tenant_id IS NULL;
SELECT count(*) FROM task WHERE tenant_id IS NULL;
ALTER TABLE task ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE task ADD CONSTRAINT fk_task_scope
FOREIGN KEY (tenant_id,workspace_id,project_id)
REFERENCES project(tenant_id,workspace_id,id);`,
      `rows backfilled=28413
orphan tasks=0
constraint fk_task_scope added
失败边界：存在孤儿任务时停止收紧，先定位错误 project_id 并保留旧读路径`,
    ),
  ],
  [
    example(
      '用 Gradle 模块表达 TeamFlow 业务边界',
      'kotlin',
      `include(
  ":identity", ":workspace", ":project", ":task",
  ":notification", ":audit", ":app"
)

// task/build.gradle.kts
dependencies {
  implementation(project(":workspace"))
  implementation(project(":audit"))
  implementation(project(":notification:events"))
  testImplementation(project(":app"))
}`,
      `./gradlew projects
Project ':identity'
Project ':workspace'
Project ':task'
Project ':audit'
失败边界：task 直接依赖 notification 内部实现或循环依赖 workspace 时架构测试失败`,
    ),
    example(
      '共享 OpenAPI 契约但不共享数据库实体',
      'typescript',
      `import type { components } from '../contracts/teamflow-api';
type TaskResponse = components['schemas']['TaskResponse'];
function renderTask(task: TaskResponse) {
  return { id: task.id, title: task.title, status: task.status, version: task.version };
}
const response: TaskResponse = { id:'task_1',title:'修复登录',status:'DOING',version:4 } as TaskResponse;
console.log(renderTask(response));`,
      `{"id":"task_1","title":"修复登录","status":"DOING","version":4}
失败边界：Vue 页面不能依赖 JPA 实体字段顺序，Spring 实体也不能直接序列化为 API`,
    ),
    example(
      '用 Compose 固定数据库、缓存与消息健康检查',
      'yaml',
      `services:
  postgres:
    image: postgres:16.4
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U teamflow -d teamflow"]
      interval: 5s
      retries: 10
  redis:
    image: redis:7.4
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
  rabbitmq:
    image: rabbitmq:3.13-management
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]`,
      `docker compose up -d --wait
postgres healthy redis healthy rabbitmq healthy
PASS dependencies ready before app
失败边界：用 sleep 代替健康检查会在数据库尚未接受连接时启动应用，导致迁移偶发失败`,
    ),
    undefined,
    example(
      '从空卷重建 TeamFlow 并跑通登录、任务、通知和审计',
      'shell',
      `docker compose down -v --remove-orphans
docker compose up -d --wait
./gradlew flywayMigrate bootRun --args='--spring.profiles.active=local' &
until curl -fsS localhost:8080/actuator/health/readiness >/dev/null; do sleep 1; done
pnpm --filter teamflow-web dev &
pnpm exec playwright test tests/teamflow-smoke.spec.ts --project=local`,
      `migration V12 applied
login=test-admin workspace=ws_1 task=task_1
notification=queued audit=written
1 passed (5.2s)
失败边界：依赖手工建库、手工清 Redis 或未提交环境变量时重建验收失败`,
    ),
  ],
  [
    example(
      '认证后按租户、工作区、项目和任务加载对象',
      'java',
      `public Task loadForUpdate(Actor actor, String tenantId, String workspaceId,
                          String projectId, String taskId) {
  if (!actor.tenantIds().contains(tenantId)) throw new NotFound("TASK_NOT_ACCESSIBLE");
  return taskRepository
    .findScoped(tenantId, workspaceId, projectId, taskId)
    .filter(task -> actor.projectIds().contains(projectId))
    .orElseThrow(() -> new NotFound("TASK_NOT_ACCESSIBLE"));
}
var task = loadForUpdate(actor, "tenant-a", "ws_1", "p_1", "task_1");
System.out.println(task.id() + ":" + task.version());`,
      `task_1:4
cross-tenant or non-project task -> 404 TASK_NOT_ACCESSIBLE
失败边界：只凭登录用户或全局 task id 查询时，对象级授权失效`,
    ),
    example(
      '在同一事务写入任务、审计和 Outbox',
      'sql',
      `BEGIN;
UPDATE task
SET status='DONE', version=version+1
WHERE tenant_id='tenant-a' AND project_id='p_1' AND id='task_1' AND version=4;
INSERT INTO audit_log(id,tenant_id,actor_id,action,object_id,request_id)
VALUES ('audit_1','tenant-a','user_1','task.transition','task_1','req-42');
INSERT INTO outbox(event_id,event_key,event_type,payload)
VALUES ('evt_1','audit_1','TaskCompleted','{"taskId":"task_1","version":5}');
COMMIT;`,
      `task version=5 audit_1 written outbox_evt_1 pending
PASS business audit and message intent commit together
失败边界：直接调用 RabbitMQ 后再提交数据库时，消息与任务状态可能一块成功一块失败`,
    ),
    example(
      '用幂等键和版本号分别处理重复与冲突',
      'sql',
      `INSERT INTO idempotency(key,request_hash,response_json)
VALUES ('create-task-42','sha256:abc','{"taskId":"task_1"}')
ON CONFLICT (key) DO NOTHING
RETURNING key;

UPDATE task
SET title='修复登录并补充审计',version=version+1
WHERE id='task_1' AND version=4
RETURNING id,title,version;`,
      `first create: key inserted task_1
duplicate create: existing task_1 response reused
stale update version=4 -> UPDATE 0
失败边界：重复键不同请求正文返回 409；同一旧版本更新返回 409 并给出当前版本`,
    ),
    undefined,
    example(
      '让错误码、日志和 Outbox 指标共享同一条追踪身份',
      'javascript',
      `const event = { requestId: 'req-42', tenantId: 'tenant-a', taskId: 'task_1', code: 'TASK_VERSION_CONFLICT' };
console.log('error log=' + JSON.stringify(event));
console.log('metric task_error_total{code="' + event.code + '"} 1');
console.log('traceLink=' + event.requestId + ' correlate task_1');
const retry = event.code === 'TASK_VERSION_CONFLICT' ? 'reload-task' : 'manual-review';
console.log('frontendAction=' + retry);`,
      `error log={"requestId":"req-42","tenantId":"tenant-a","taskId":"task_1","code":"TASK_VERSION_CONFLICT"}
metric task_error_total{code="TASK_VERSION_CONFLICT"} 1
frontendAction=reload-task
失败边界：日志只写“操作失败”或缺少 requestId 时无法联动接口、消息和审计`,
    ),
  ],
  [
    example(
      '切换工作区先清空请求、缓存和通知未读数',
      'typescript',
      `async function activateWorkspace(next: string, state: WorkspaceClient) {
  state.abort.abort();
  state.abort = new AbortController();
  state.queryClient.removeQueries({ queryKey: ['tasks'] });
  state.queryClient.removeQueries({ queryKey: ['audit'] });
  state.notificationStore.reset();
  state.workspaceId = next;
  const role = await state.api.membership(next, { signal: state.abort.signal });
  state.role = role.name;
  state.notificationStore.hydrate(await state.api.unread(next));
  console.log('workspace=' + next + ' role=' + state.role + ' oldTasks=' + state.taskCount());
}`,
      `workspace=ws_2 role=MEMBER oldTasks=0
失败边界：请求失败时保留当前工作区；旧任务、未读数或角色不得混入新租户`,
    ),
    example(
      '任务看板提供状态菜单而不只依赖拖拽',
      'typescript',
      `test('member can move task without drag', async ({ page }) => {
  await page.goto('/workspaces/ws_1/projects/p_1');
  const card = page.getByRole('article', { name: /修复登录/ });
  await card.getByRole('button', { name: '任务操作' }).click();
  await page.getByRole('menuitem', { name: '移到进行中' }).click();
  await expect(page.getByRole('status')).toContainText('已更新');
  await expect(card).toHaveAccessibleName(/进行中/);
});`,
      `1 passed
oldStatus=TODO newStatus=DOING audit=written
失败边界：拖拽是唯一入口时键盘和辅助技术用户无法完成状态变更`,
    ),
    example(
      '把权限、冲突和会话过期拆成不同恢复路径',
      'typescript',
      `type Failure = 'forbidden'|'not-found'|'conflict'|'expired';
function viewFor(failure: Failure) {
  const views = {
    forbidden: { title: '当前角色不能执行此操作', action: 'back' },
    'not-found': { title: '任务不存在或无权查看', action: 'return-project' },
    conflict: { title: '任务已被其他成员更新', action: 'reload-task' },
    expired: { title: '登录已过期', action: 'login-and-return' },
  } as const;
  return views[failure];
}
console.log(viewFor('conflict'));`,
      `{"title":"任务已被其他成员更新","action":"reload-task"}
失败边界：会话过期返回登录页时丢失目标 URL，用户需要重新寻找任务`,
    ),
    undefined,
    example(
      '在移动端保留任务动作并处理长文本',
      'typescript',
      `test('task actions remain available at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/workspaces/ws_1/projects/p_1/tasks/task_1');
  const title = '这是一个非常长的跨部门客户交付任务标题用于验证换行与操作区不重叠';
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: '切换状态' }).click();
  await page.getByRole('menuitem', { name: '完成' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});`,
      `1 passed
longTitleWraps=true statusMenuVisible=true scrollWidth=320
失败边界：桌面看板缩小后按钮不可达或长标题遮挡状态操作时移动验收失败`,
    ),
  ],
  [
    example(
      '用角色、对象和动作矩阵覆盖允许与拒绝',
      'java',
      `@ParameterizedTest
@CsvSource({
  "ADMIN,workspace,invite,true",
  "LEAD,project,create,true",
  "MEMBER,task,update,true",
  "AUDITOR,task,update,false",
  "MEMBER,audit,read,false"
})
void roleObjectActionMatrix(Role role, Resource resource, Action action, boolean allowed) {
  assertThat(authz.can(new Subject("u1", "tenant-a", role), resource, action)).isEqualTo(allowed);
}
System.out.println("matrix cases=5");`,
      `matrix cases=5 passed=5
ADMIN workspace invite=true
MEMBER audit read=false
失败边界：只测允许路径不测跨租户和只读角色时，权限矩阵不完整`,
    ),
    example(
      '撤权后立即验证任务、评论与通知访问',
      'shell',
      `curl -fsS -X DELETE "$BASE/workspaces/ws_1/members/member_1" -H "Authorization: Bearer $ADMIN"
redis-cli DEL auth:member_1:ws_1
for path in tasks/ task_1 comments notifications; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/workspaces/ws_1/$path" -H "Authorization: Bearer $MEMBER_TOKEN")
  echo "$path=$code"
done`,
      `tasks/=403
task_1=403
comments=403
notifications=401
失败边界：撤权后任一入口仍可写会保留旧缓存或旧会话，必须立即升级事故`,
    ),
    example(
      '并发版本冲突与重复消费后核对三处最终状态',
      'sql',
      `SELECT
  (SELECT count(*) FROM task WHERE id='task_1' AND version=5) AS task_version_ok,
  (SELECT count(*) FROM audit_log WHERE object_id='task_1') AS audits,
  (SELECT count(*) FROM notification WHERE event_id='evt_1') AS notifications,
  (SELECT count(*) FROM outbox WHERE event_id='evt_1' AND sent_at IS NOT NULL) AS sent;

-- Re-deliver evt_1 twice before this assertion.`,
      `task_version_ok=1 audits=1 notifications=1 sent=1
PASS concurrency and duplicate delivery converge
失败边界：audits>1 或 notifications>1 说明幂等键没有覆盖对应副作用`,
    ),
    undefined,
    example(
      '把权限、可访问性和性能结论绑定到同一版本',
      'shell',
      `pnpm exec playwright test tests/teamflow-security.spec.ts --project=chromium-mobile
pnpm exec axe http://127.0.0.1:4173/workspaces/ws_1/projects/p_1 --exit
k6 run scripts/task-list.js --vus 50 --duration 2m --summary-export artifacts/task-list.json
node scripts/check-release-evidence.mjs --commit "$GIT_SHA" \\
  --security artifacts/security.json --a11y artifacts/axe.json --perf artifacts/task-list.json`,
      `security=4 passed mobileFlow=1 passed axe=0 serious
taskListP95=241ms errors=0.002 commit=7f3a9c2
releaseEvidence=complete
失败边界：只报告“所有测试通过”而不绑定提交、数据规模和风险项时证据无效`,
    ),
  ],
  [
    example(
      '把应用、前端和迁移拆成独立构建阶段',
      'dockerfile',
      `FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN ./gradlew :app:bootJar --no-daemon

FROM eclipse-temurin:21-jre
COPY --from=build /src/app/build/libs/app.jar /app/app.jar
USER 10001
ENTRYPOINT ["java","-jar","/app/app.jar"]

FROM flyway/flyway:10 AS migrate
COPY migrations /flyway/sql`,
      `app image digest=sha256:4f2e...
web image digest=sha256:91ab...
migration job uses same schema version=12
失败边界：应用启动时动态下载依赖或在运行时执行不可追踪迁移时发布失败`,
    ),
    example(
      '通过外部秘密和环境变量注入配置',
      'yaml',
      `env:
  - name: SPRING_DATASOURCE_URL
    valueFrom: { secretKeyRef: { name: teamflow-db, key: url } }
  - name: SPRING_REDIS_PASSWORD
    valueFrom: { secretKeyRef: { name: teamflow-redis, key: password } }
  - name: TEAMFLOW_JWT_SECRET
    valueFrom: { secretKeyRef: { name: teamflow-jwt, key: secret } }
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: http://otel-collector.observability:4317`,
      `secret refs=3 plaintext secrets=0
readiness config-valid=true
失败边界：application.yml 中出现真实 JWT 或数据库密码时安全门禁阻断`,
    ),
    example(
      '让 readiness 同时检查依赖与迁移版本',
      'java',
      `@Component
class Readiness implements HealthIndicator {
  public Health health() {
    var db = dataSource.ping();
    var redis = redis.ping();
    var rabbit = rabbit.ping();
    var schema = flyway.info().current().getVersion().getVersion();
    var ready = db && redis && rabbit && schema.equals("12");
    return ready ? Health.up().withDetail("schema", schema).build()
                 : Health.down().withDetail("schema", schema).build();
  }
}`,
      `{"status":"UP","components":{"db":"UP","redis":"UP","rabbit":"UP","schema":"12"}}
rabbit down -> readiness DOWN liveness UP
失败边界：把消息队列短暂延迟写进 liveness 会触发无意义重启，不能等同于进程卡死`,
    ),
    undefined,
    example(
      '按迁移、后端、前端和旧客户端兼容顺序发布',
      'shell',
      `kubectl apply -f k8s/migrate-v12.yaml
kubectl wait --for=condition=complete job/migrate-v12 --timeout=180s
kubectl set image deployment/teamflow-api api=registry.local/teamflow-api:$SHA
kubectl rollout status deployment/teamflow-api --timeout=180s
kubectl set image deployment/teamflow-web web=registry.local/teamflow-web:$SHA
curl -fsS "$BASE/actuator/health/readiness" | jq -e '.schema=="12"'`,
      `migration V12 complete
api schema=v12 ready web=v28
old-client-compatible=true
失败边界：先删旧字段再发布旧客户端仍使用的 API 会导致任务列表白屏`,
    ),
  ],
  [
    example(
      'RabbitMQ 延迟时保留 Outbox 并显示通知延迟',
      'sql',
      `SELECT count(*) AS pending,
       min(created_at) AS oldest,
       max(attempt) AS max_attempt
FROM outbox
WHERE sent_at IS NULL AND event_type IN ('TaskCompleted','CommentCreated');

SELECT status, count(*)
FROM notification
GROUP BY status;`,
      `pending=42 oldest_age=95s max_attempt=3
notification queued=38 failed=4
失败边界：为了清空队列删除 Outbox 会永久丢失通知事实；应暂停发送、告警并重试`,
    ),
    example(
      '撤权后清理浏览器、Redis、本地与旧会话',
      'javascript',
      `const memberVersion = 8;
const keys = {
  browser: 'tf:role:ws_1:member_1',
  redis: 'auth:ws_1:member_1:v8',
  local: 'tf:local-permissions:member_1',
};
localStorage.removeItem(keys.browser);
localStorage.removeItem(keys.local);
await redis.del(keys.redis);
await sessionRegistry.revoke('member_1', { workspaceId: 'ws_1', afterVersion: 8 });
console.log(JSON.stringify({ cleared: Object.keys(keys).length, memberVersion, nextWriteExpected: 403 }));`,
      `{"cleared":3,"memberVersion":8,"nextWriteExpected":403}
失败边界：只清浏览器缓存不撤销服务端会话时，旧标签页仍可写入任务`,
    ),
    undefined,
    example(
      '同时回滚数据库兼容层、缓存和消息消费者',
      'shell',
      `kubectl scale deployment/notification-worker --replicas=0
kubectl rollout undo deployment/teamflow-api
kubectl rollout status deployment/teamflow-api --timeout=180s
redis-cli --scan --pattern 'auth:ws_*:v9:*' | xargs -r redis-cli DEL
psql "$DATABASE_URL" -f scripts/reconcile-teamflow.sql
kubectl scale deployment/notification-worker --replicas=2`,
      `api revision=previous schema=v11-compatible
auth cache v9 evicted=27
reconcile mismatches=0 notifications resumed
失败边界：旧版本无法解析新事件时先停消费者并保留 Outbox，不能让失败消息无限重投`,
    ),
    example(
      '用一条任务链路完成多租户与一致性答辩',
      'json',
      `{
  "flow": ["invite", "accept", "create-project", "create-task", "comment", "outbox", "notify", "audit"],
  "tenantBoundary": ["tenant_id composite foreign key", "principal-derived tenant", "project membership check"],
  "consistency": ["task and audit in one transaction", "outbox with unique event key", "consumer idempotency"],
  "failureEvidence": ["cross-tenant 404", "revoke 403", "rabbit lag 95s", "rollback reconciled"],
  "rejected": ["shared unrestricted task table", "sync notification in write transaction"]
}`,
      `flowStages=8 tenantBoundary=3 consistency=3 failureEvidence=4
decision=modular-monolith-with-outbox-and-scoped-auth
失败边界：无法演示跨租户拒绝、撤权或消息重放时架构答辩不通过`,
    ),
  ],
];

const PROJECT_EXAMPLES: ProjectExampleGrid = [
  ...STUDIO_EXAMPLES,
  ...PULSE_EXAMPLES,
  ...TEAMFLOW_EXAMPLES,
];

export const PROGRAMMING_PROJECT_TRAINING_BATCH_01_COURSES =
  withProjectExamples(
    [...STUDIO_COURSES, ...PULSE_COURSES, ...TEAMFLOW_COURSES],
    PROJECT_EXAMPLES,
  );
