import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

const browserRuntime = {
  runtimeLabel: 'HTML / CSS 浏览器沙箱',
  installSteps: [
    '代码在隔离的无脚本 iframe 中渲染，不访问父页面 DOM，也不发起外部请求。',
    '每个实验都必须保留完整 doctype、lang、charset 和 viewport；样式全部内嵌在单文件中。',
    '在 1280px、768px、320px 三档视口观察实际布局，并检查标题、标签、焦点、换行和横向溢出。',
  ],
  languages: ['html'],
} as const satisfies Pick<
  LearningV2CodeLab,
  'runtimeLabel' | 'installSteps' | 'languages'
>;

const frontendTypeScriptRuntime = {
  requiredRuntime: 'node',
  runtimeLabel: '前端语义模拟 · TypeScript 类型擦除',
  docsUrl: 'https://nodejs.org/api/typescript.html',
  installSteps: [
    '使用 Node.js 24 执行：node --experimental-strip-types main.ts。',
    '本代码台不导入 React、Vue 或组件运行时；实验只验证状态机、路由、缓存、调度、SSR 契约等可由 TypeScript 诚实证明的不变量。',
    'stdin 是任务输入。先运行起始代码，再按 checkpoint 制造至少一个非法或竞争场景，确认断言会失败。',
  ],
  languages: ['typescript'],
} as const satisfies Pick<
  LearningV2CodeLab,
  'requiredRuntime' | 'runtimeLabel' | 'docsUrl' | 'installSteps' | 'languages'
>;

function browserTask(
  id: string,
  title: string,
  brief: string,
  source: string,
  checkpoint: string,
): LearningV2CodeLabTask {
  return {
    id,
    title,
    brief,
    defaultLanguage: 'html',
    starterCode: { html: source },
    checkpoint,
  };
}

function browserLab(
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab {
  return {
    title,
    description,
    ...browserRuntime,
    practice,
    apply,
  };
}

type TypeScriptTaskInput = {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
  readonly stdin: string;
  readonly code: string;
  readonly checkpoint: string;
};

function frontendTask(input: TypeScriptTaskInput): LearningV2CodeLabTask {
  return {
    id: input.id,
    title: input.title,
    brief: input.brief,
    defaultLanguage: 'typescript',
    starterCode: { typescript: input.code },
    stdin: input.stdin,
    checkpoint: input.checkpoint,
  };
}

function frontendLab(
  title: string,
  description: string,
  practice: LearningV2CodeLabTask,
  apply: LearningV2CodeLabTask,
): LearningV2CodeLab {
  return {
    title,
    description,
    ...frontendTypeScriptRuntime,
    practice,
    apply,
  };
}

/**
 * P01-P04 的前端结构化课程实验室。
 *
 * 课程键逐字取自 core.ts。P01 是可观察的 HTML/CSS 文档；P02-P04
 * 只运行与框架无关的语义契约，不声称执行真实组件渲染、浏览器 hydration
 * 或第三方框架内部代码。
 */
export const LEARNING_CODE_LABS_FRONTEND_STRUCTURED: Readonly<
  Record<string, LearningV2CodeLab>
> = {
  'programming:HTML 语义、表单与可访问性': browserLab(
    'P01 代码台 01 · 语义地标、表单标签与可见错误',
    '用一个可提交的工单表单验证 header、nav、main、label、fieldset、legend、aria-describedby 和原生 button 的协作，不依赖 JavaScript 补语义。',
    browserTask(
      'frontend-p01-html-form-guided',
      '跟做：可键盘操作的工单表单',
      '补全工单页面：提供跳到主内容链接、带名称的导航、唯一 main、关联标签的邮箱字段、带 legend 的状态组、错误说明和原生提交按钮。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>创建支持工单</title>
    <style>
      * { box-sizing: border-box; }
      :root { font-family: system-ui, sans-serif; color: #1f2937; background: #f3f6f8; }
      body { margin: 0; min-width: 0; }
      a { color: #075985; }
      .skip {
        position: absolute;
        inset-block-start: -4rem;
        inset-inline-start: 1rem;
        padding: .75rem 1rem;
        background: #fff;
      }
      .skip:focus { inset-block-start: 1rem; z-index: 2; }
      header { padding: 1rem clamp(1rem, 5vw, 3rem); background: #12372a; color: #fff; }
      header a { color: #fff; }
      nav { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; margin-block-start: .75rem; }
      main {
        width: min(46rem, 100%);
        margin-inline: auto;
        padding: clamp(1rem, 5vw, 3rem) 1rem;
      }
      form, fieldset { display: grid; gap: 1rem; min-width: 0; }
      fieldset { border: 1px solid #9ca3af; padding: 1rem; }
      label, legend { font-weight: 700; }
      input, select, textarea, button {
        width: 100%;
        min-height: 44px;
        padding: .65rem .75rem;
        border: 1px solid #64748b;
        border-radius: .35rem;
        font: inherit;
      }
      textarea { min-height: 7rem; resize: vertical; }
      .help, .error { margin: .25rem 0 0; }
      .error { color: #9f1239; font-weight: 700; }
      button { border: 0; background: #0f766e; color: #fff; font-weight: 800; }
      :focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
      @media (max-width: 32rem) {
        h1 { font-size: 1.75rem; }
        header, main { padding-inline: 1rem; }
      }
    </style>
  </head>
  <body>
    <a class="skip" href="#main">跳到主内容</a>
    <header>
      <strong>星河服务中心</strong>
      <nav aria-label="主导航">
        <a href="#main" aria-current="page">创建工单</a>
        <a href="#history">工单历史</a>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <h1>创建支持工单</h1>
      <p>带星号的信息用于联系与回访。</p>
      <form action="#submitted" method="get" novalidate>
        <p id="form-error" class="error" role="alert">邮箱格式不正确，请修改后再提交。</p>
        <div>
          <label for="email">工作邮箱 *</label>
          <input id="email" name="email" type="email" value="ops.example"
            autocomplete="email" aria-invalid="true"
            aria-describedby="email-help form-error">
          <p id="email-help" class="help">用于接收处理进度，不会公开显示。</p>
        </div>
        <fieldset>
          <legend>问题类型 *</legend>
          <label><input type="radio" name="kind" value="access" checked> 账号与权限</label>
          <label><input type="radio" name="kind" value="data"> 数据异常</label>
        </fieldset>
        <div>
          <label for="detail">问题描述 *</label>
          <textarea id="detail" name="detail" aria-describedby="detail-help">昨日下午开始无法打开报表。</textarea>
          <p id="detail-help" class="help">请包含页面、时间和看到的完整提示。</p>
        </div>
        <button type="submit">提交工单</button>
      </form>
      <section id="history" aria-labelledby="history-title">
        <h2 id="history-title">最近记录</h2>
        <p>提交后可在这里查看状态。</p>
      </section>
    </main>
  </body>
</html>`,
      '页面只有一个 main；跳转链接第一次 Tab 出现且可聚焦；邮箱有 label、错误文本通过 aria-describedby 关联；问题类型使用 fieldset 与 legend；所有输入和按钮高度至少 44px；320px、768px、1280px 均无页面横向溢出。',
    ),
    browserTask(
      'frontend-p01-html-form-independent',
      '独立实践：订单详情与取消原因',
      '构建订单详情页：包含当前导航、语义化数据表、取消表单、复选框错误、原生 details 说明和清晰的焦点样式。取消按钮不能在未确认复选框时假装可提交。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>订单 O-2048</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #172033; background: #edf1f7; font: 16px/1.65 system-ui, sans-serif; }
      header { background: #172554; color: #fff; }
      .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; width: min(72rem, 100%); margin: auto; padding: 1rem; }
      nav { display: flex; flex-wrap: wrap; gap: .4rem 1rem; }
      a { color: inherit; text-underline-offset: .2em; }
      a[aria-current="page"] { text-decoration-thickness: .2em; }
      main { width: min(72rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 2rem); }
      .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(17rem, 24rem); gap: 2rem; align-items: start; }
      section, .action { min-width: 0; padding: 1.25rem; background: #fff; border: 1px solid #cbd5e1; border-radius: .4rem; }
      h1, h2 { line-height: 1.2; }
      h1 { overflow-wrap: anywhere; }
      .table-wrap { max-width: 100%; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; }
      caption { text-align: start; font-weight: 800; padding-block-end: .75rem; }
      th, td { padding: .75rem; border-block-end: 1px solid #dbe3ec; text-align: start; }
      form { display: grid; gap: 1rem; }
      label { font-weight: 700; }
      textarea { min-height: 6rem; }
      input, textarea, button { min-height: 44px; font: inherit; }
      input[type="checkbox"] { width: 1.25rem; height: 1.25rem; vertical-align: middle; }
      input, textarea { width: 100%; padding: .6rem; }
      .error { color: #9f1239; font-weight: 700; }
      button { padding: .75rem 1rem; border: 0; border-radius: .3rem; background: #b91c1c; color: #fff; font-weight: 800; }
      details { margin-block-start: 1rem; }
      summary { min-height: 44px; padding-block: .7rem; cursor: pointer; font-weight: 700; }
      :focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
      @media (max-width: 52rem) { .grid { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 24rem) {
        th, td { padding: .55rem .4rem; }
        .bar, main { padding-inline: .75rem; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="bar">
        <strong>北辰订单</strong>
        <nav aria-label="账户">
          <a href="#orders">订单列表</a>
          <a href="#detail" aria-current="page">订单详情</a>
          <a href="#help">帮助</a>
        </nav>
      </div>
    </header>
    <main id="detail">
      <h1>订单 O-2048</h1>
      <div class="grid">
        <section aria-labelledby="items-title">
          <h2 id="items-title">商品明细</h2>
          <div class="table-wrap">
            <table>
              <caption>本单共 2 件商品，合计 214 元</caption>
              <thead>
                <tr><th scope="col">商品</th><th scope="col">数量</th><th scope="col">小计</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row">机械键盘</th><td>1</td><td>168 元</td></tr>
                <tr><th scope="row">腕托</th><td>1</td><td>46 元</td></tr>
              </tbody>
            </table>
          </div>
          <details>
            <summary>退款会退到哪里？</summary>
            <p>审核通过后原路退回；银行处理时间以发卡机构为准。</p>
          </details>
        </section>
        <aside class="action" aria-labelledby="cancel-title">
          <h2 id="cancel-title">申请取消</h2>
          <form action="#cancelled" method="get">
            <div>
              <label for="reason">取消原因</label>
              <textarea id="reason" name="reason" aria-describedby="reason-error">重复下单</textarea>
              <p id="reason-error" class="error" role="alert">提交前请确认订单与退款说明。</p>
            </div>
            <label>
              <input type="checkbox" name="confirm">
              我已阅读退款与库存释放规则
            </label>
            <button type="submit">确认取消</button>
          </form>
        </aside>
      </div>
      <section id="orders" aria-labelledby="orders-title">
        <h2 id="orders-title">订单帮助</h2>
        <p id="help">取消申请提交后仍可在历史记录中查看进度。</p>
      </section>
    </main>
  </body>
</html>`,
      '当前订单链接具有 aria-current；表格有 caption、列标题和行标题；取消原因有标签和错误说明；details 的 summary 可由键盘展开；确认复选框和提交按钮均至少 44px；320px 下表格只在自身容器滚动，页面无横向溢出。',
    ),
  ),

  'programming:CSS 级联、布局与响应式': browserLab(
    'P01 代码台 02 · 层叠约束、Flex 收缩与内容断点',
    '通过层叠层、逻辑盒模型、min-width:0、Grid 轨道和移动断点搭建企业发布页，并用实际计算尺寸判断布局是否稳定。',
    browserTask(
      'frontend-p01-css-layout-guided',
      '跟做：稳定侧栏、长标题与操作按钮',
      '实现发布工作区：内容区使用 Grid，侧栏在窄屏下移到主内容之后；工具栏中的长标题必须省略而不挤走按钮；所有按钮触控高度至少 44px。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>发布工作区</title>
    <style>
      @layer reset, tokens, components, utilities;
      @layer reset {
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; }
        button, input { font: inherit; }
      }
      @layer tokens {
        :root {
          --ink: #172033;
          --muted: #52606d;
          --line: #cbd5e1;
          --surface: #ffffff;
          --canvas: #eef4f2;
          --accent: #0f766e;
          --space: clamp(1rem, 3vw, 2rem);
        }
      }
      @layer components {
        body { min-width: 0; background: var(--canvas); color: var(--ink); font: 16px/1.65 system-ui, sans-serif; }
        header { padding: var(--space); background: #153d37; color: #fff; }
        header p { max-width: 68ch; margin-block: .4rem; color: #d8f3ed; }
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
          gap: var(--space);
          width: min(76rem, 100%);
          margin-inline: auto;
          padding: var(--space);
        }
        .panel { min-width: 0; padding: 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: .4rem; }
        .toolbar { display: flex; align-items: center; gap: .75rem; min-width: 0; }
        .toolbar-title {
          min-width: 0;
          flex: 1 1 auto;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          font-weight: 800;
        }
        .toolbar button { flex: 0 0 auto; min-height: 44px; padding: .65rem 1rem; }
        h1, h2 { line-height: 1.2; }
        h1 { overflow-wrap: anywhere; }
        .fields { display: grid; gap: .9rem; }
        label { display: grid; gap: .35rem; font-weight: 700; }
        input { width: 100%; min-height: 44px; padding: .6rem; border: 1px solid #64748b; }
        .status { padding: .8rem; border-inline-start: .3rem solid var(--accent); background: #ecfdf5; }
        :focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
      }
      @layer utilities {
        @media (max-width: 48rem) {
          .layout { grid-template-columns: minmax(0, 1fr); }
          .panel { width: 100%; }
        }
        @media (max-width: 24rem) {
          header, .layout { padding-inline: .75rem; }
          .toolbar { align-items: stretch; flex-wrap: wrap; }
          .toolbar-title { flex-basis: 100%; }
          .toolbar button { flex: 1 1 auto; }
        }
      }
    </style>
  </head>
  <body>
    <header>
      <p>内容运营中心</p>
      <h1>2026 年冬季课程发布工作区</h1>
      <p>当前版本只发布已通过审核的课程，草稿不会进入公开目录。</p>
    </header>
    <div class="layout">
      <main class="panel">
        <div class="toolbar">
          <span class="toolbar-title">Vue 企业前端：状态、路由、缓存与发布验证的综合实践课程</span>
          <button type="button">预览</button>
          <button type="button">发布</button>
        </div>
        <h2>发布说明</h2>
        <div class="fields">
          <label>版本名称<input value="2026.11.24"></label>
          <label>变更摘要<input value="补齐移动端与缓存回归"></label>
        </div>
      </main>
      <aside class="panel">
        <h2>检查结果</h2>
        <p class="status">类型检查、课程内容审计和移动端截图均已通过。</p>
      </aside>
    </div>
  </body>
</html>`,
      '桌面宽度下主区与侧栏为两列，宽度低于 48rem 后变为单列且内容仍可读；长标题在剩余空间内省略，预览与发布按钮不被压缩；按钮高度不小于 44px；320px 下页面 scrollWidth 不大于 viewport，标题与输入值不顶出卡片。',
    ),
    browserTask(
      'frontend-p01-css-layout-independent',
      '独立实践：容器查询驱动的课程卡',
      '构建一个课程卡列表，使用 container-type 与 @container 让卡片按父容器切换单列和双列，而不是只按视口媒体查询。窄卡中长标题、标签和操作区不得溢出。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>课程卡片布局</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; background: #f8f5ef; color: #292524; font: 16px/1.6 system-ui, sans-serif; }
      main { width: min(74rem, 100%); margin: auto; padding: clamp(.75rem, 4vw, 2.5rem); }
      h1 { max-width: 18ch; margin-block-end: .5rem; font-size: clamp(2rem, 7vw, 4rem); line-height: .98; }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem);
        gap: clamp(1rem, 3vw, 2rem);
        align-items: start;
  }
      .catalog, .rail { min-width: 0; container-type: inline-size; }
      .cards { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; }
      .card {
        min-width: 0;
        padding: 1rem;
        background: #fff;
        border: 1px solid #d6d3d1;
        border-radius: .4rem;
      }
      .card h2 { margin-block: 0 .35rem; overflow-wrap: anywhere; }
      .meta { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0; padding: 0; list-style: none; }
      .meta li { padding: .2rem .5rem; border: 1px solid #a8a29e; border-radius: 999px; font-size: .85rem; }
      .actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-block-start: 1rem; }
      .actions a, .actions button {
        display: inline-grid;
        place-items: center;
        min-height: 44px;
        padding: .55rem .8rem;
        border: 1px solid #0f766e;
        border-radius: .3rem;
        color: #0f5c55;
        background: #fff;
        font: inherit;
        font-weight: 700;
      }
      .actions a { background: #0f766e; color: #fff; text-decoration: none; }
      :focus-visible { outline: 3px solid #c2410c; outline-offset: 3px; }
      @container (min-width: 34rem) {
        .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 48rem) {
        .layout { grid-template-columns: minmax(0, 1fr); }
        .rail { order: -1; }
      }
      @media (max-width: 24rem) {
        main { padding-inline: .7rem; }
        .actions > * { flex: 1 1 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>冬季课程学习路径</h1>
      <div class="layout">
        <section class="catalog" aria-labelledby="catalog-title">
          <h2 id="catalog-title">推荐课程</h2>
          <div class="cards">
            <article class="card">
              <h2>可访问表单与错误恢复</h2>
              <p>从标签、键盘顺序和状态提示开始建立可验证的注册流程。</p>
              <ul class="meta"><li>HTML</li><li>无障碍</li></ul>
              <div class="actions"><a href="#start-a">开始学习</a><button type="button">加入计划</button></div>
            </article>
            <article class="card">
              <h2>CSS 容器查询与响应式组件</h2>
              <p>根据组件真实可用宽度切换布局，不依赖设备型号猜测。</p>
              <ul class="meta"><li>CSS</li><li>响应式</li></ul>
              <div class="actions"><a href="#start-b">开始学习</a><button type="button">加入计划</button></div>
            </article>
          </div>
        </section>
        <aside class="rail" aria-labelledby="plan-title">
          <div class="card">
            <h2 id="plan-title">本周计划</h2>
            <p>预计 3 小时，完成两个实验并提交窄屏截图。</p>
            <div class="actions"><a href="#week-plan">查看安排</a></div>
          </div>
        </aside>
      </div>
    </main>
  </body>
</html>`,
      '在宽容器中两张课程卡自动成为两列，窄容器或 320px 视口成为一列；容器查询不改变 DOM 阅读顺序；卡片长标题可换行；操作链接和按钮至少 44px；页面无横向溢出，内部滚动宽度也不超过各自容器。',
    ),
  ),

  'programming:浏览器渲染、性能与前端安全': browserLab(
    'P01 代码台 03 · 首屏稳定性与安全内容边界',
    '用无外部资源的静态页面验证首屏尺寸占位、字体换行、减少动态和安全内容表达；所有性能与安全结论都必须来自可观察结构，而不是伪造分数。',
    browserTask(
      'frontend-p01-browser-render-guided',
      '跟做：稳定首屏与无偏移媒体占位',
      '实现新闻首页首屏：主图使用纯 CSS 固定宽高比占位，标题和摘要预留稳定空间，窄屏不出现横向滚动，打印和减少动态偏好都保持可读。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>城市交通观察</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      :root { color-scheme: light; --ink: #172033; --accent: #b45309; --paper: #fffdf8; }
      body { margin: 0; min-width: 0; color: var(--ink); background: #f1f5f9; font: 16px/1.65 "Noto Serif SC", Georgia, serif; }
      header { border-block-end: 1px solid #cbd5e1; background: var(--paper); }
      .bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; width: min(75rem, 100%); margin: auto; padding: 1rem; }
      nav { display: flex; flex-wrap: wrap; gap: .5rem 1rem; }
      a { color: #7c2d12; }
      main { width: min(75rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 2.5rem); }
      .lead { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(17rem, 1fr); gap: clamp(1rem, 3vw, 2rem); align-items: start; }
      article, aside { min-width: 0; }
      h1 { margin-block: .2rem 1rem; font-size: clamp(2.3rem, 7vw, 5.2rem); line-height: .98; overflow-wrap: anywhere; }
      .lede { font-size: clamp(1.05rem, 2vw, 1.35rem); }
      .media {
        aspect-ratio: 16 / 9;
        display: grid;
        place-items: center;
        min-width: 0;
        overflow: hidden;
        border: 1px solid #94a3b8;
        background:
          linear-gradient(135deg, transparent 45%, #0f766e 45% 55%, transparent 55%),
          linear-gradient(45deg, #dbeafe 50%, #fef3c7 50%);
        color: #0f172a;
        font: 800 clamp(1.2rem, 4vw, 2rem)/1.1 system-ui, sans-serif;
      }
      .caption { margin-block-start: .4rem; color: #475569; font-size: .9rem; }
      .brief { padding: 1rem; background: var(--paper); border-block-start: .35rem solid var(--accent); }
      .brief ul { padding-inline-start: 1.2rem; }
      .skeleton-line { height: 1rem; margin-block: .65rem; background: #dbe3ec; }
      .skeleton-line.short { width: 68%; }
      @media (max-width: 48rem) { .lead { grid-template-columns: minmax(0, 1fr); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto; animation: none; transition: none; } }
      @media print {
        body { background: #fff; font-size: 11pt; }
        header, aside { display: none; }
        main { padding: 0; }
        .media { border: 1px solid #000; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="bar">
        <strong>城市交通观察</strong>
        <nav aria-label="文章导航"><a href="#story" aria-current="page">今日深度</a><a href="#data">数据说明</a></nav>
      </div>
    </header>
    <main id="story">
      <div class="lead">
        <article>
          <p>通勤研究 · 第 18 期</p>
          <h1>雨天的换乘为什么更慢</h1>
          <p class="lede">从站台容量、步行路径和信号配时三个环节观察晚高峰的真实瓶颈。</p>
          <div class="media" role="img" aria-label="蓝黄相间的抽象线路图，中间有一条绿色换乘通道">轨道换乘示意图</div>
          <p class="caption">示意图只表达空间关系，不代表真实线路比例。</p>
        </article>
        <aside class="brief" aria-labelledby="brief-title">
          <h2 id="brief-title">阅读前事实</h2>
          <ul>
            <li>观察时段为工作日 17:30 至 19:00。</li>
            <li>雨天步行时间增加，但列车运行间隔基本不变。</li>
            <li>数据只覆盖三个换乘站。</li>
          </ul>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </aside>
      </div>
      <section id="data" aria-labelledby="data-title">
        <h2 id="data-title">指标口径</h2>
        <p>记录站台排队、步行耗时和上车等待，超出一分钟的样本单独标记。</p>
      </section>
    </main>
  </body>
</html>`,
      '媒体区域始终保持 16:9 且没有外链图片；标题、导语和事实卡不重叠；1280px 为两列，768px 与 320px 为单列；页面 scrollWidth 不超过视口；开启减少动态后无动画；打印预览隐藏导航和侧栏但保留正文。',
    ),
    browserTask(
      'frontend-p01-browser-render-independent',
      '独立实践：安全公告与内容编码',
      '构建一张安全公告页，使用 meta CSP 禁止脚本、外部资源和表单提交，把攻击样例作为可见文本展示，并给出可人工核对的安全状态。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
    <title>安全公告 SA-2026-11</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; color: #172554; background: #f1f5f9; font: 16px/1.7 system-ui, sans-serif; }
      header { padding: clamp(1rem, 5vw, 3rem); background: #172554; color: #fff; }
      header p { max-width: 70ch; color: #dbeafe; }
      main { width: min(68rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 2rem); }
      h1 { margin-block: 0 .5rem; font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1; overflow-wrap: anywhere; }
      .status { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: 1rem; margin-block: 1.5rem; }
      .status div { min-width: 0; padding: 1rem; background: #fff; border: 1px solid #bfdbfe; border-radius: .4rem; }
      .status strong { display: block; font-size: 1.15rem; }
      pre { min-width: 0; max-width: 100%; overflow-x: auto; padding: 1rem; border: 1px solid #94a3b8; background: #0f172a; color: #e2e8f0; white-space: pre; }
      code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      .safe code { overflow-wrap: anywhere; white-space: normal; }
      a { color: #1d4ed8; }
      :focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
      @media (max-width: 24rem) {
        body { font-size: 15px; }
        header, main { padding-inline: .75rem; }
        pre { padding: .7rem; }
      }
    </style>
  </head>
  <body>
    <header>
      <p>安全响应中心 · 2026-11-24</p>
      <h1>富文本预览中的脚本注入边界</h1>
      <p>本页只展示已编码的攻击样例和修复状态，不执行任何脚本。</p>
    </header>
    <main>
      <section class="status" aria-labelledby="status-title">
        <h2 id="status-title">处置状态</h2>
        <div><strong>脚本来源</strong><span>已禁止</span></div>
        <div><strong>外部资源</strong><span>已禁止</span></div>
        <div><strong>表单提交</strong><span>已禁止</span></div>
      </section>
      <section aria-labelledby="sample-title">
        <h2 id="sample-title">危险输入样例</h2>
        <pre><code>&lt;img src="https://attacker.example/a.png" onerror="steal()"&gt;</code></pre>
        <p class="safe">页面源码中的标签实体只作为文字显示；CSP 同时禁止脚本和外部来源，形成第二道边界。</p>
      </section>
      <section aria-labelledby="fix-title">
        <h2 id="fix-title">修复原则</h2>
        <p>按输出上下文编码不可信文本；富文本先经白名单清洗；服务端继续设置响应头 CSP，不能只依赖页面内的 meta 策略。</p>
        <p><a href="#sample-title">返回攻击样例，检查没有图片或脚本被执行</a></p>
      </section>
    </main>
  </body>
</html>`,
      '页面没有 script、iframe、外部 link 或可提交表单；CSP 的 default-src 为 none；攻击字符串在页面上以源码文字可见；状态卡在 320px 自动单列且无溢出；Network 面板无外部请求，Console 无 CSP 触发的功能错误。',
    ),
  ),

  'programming:JavaScript 类型、作用域与闭包': frontendLab(
    'P02 代码台 01 · 引用图、闭包私有状态与不可变快照',
    '用 TypeScript 运行时断言区分共享引用、浅拷贝、深克隆和闭包绑定，再建立不会泄漏内部状态的配置快照。',
    frontendTask({
      id: 'frontend-p02-js-reference-closure-guided',
      title: '跟做：共享引用与闭包工厂',
      brief:
        'stdin 提供项目名和两个标签。构造原对象、别名、浅拷贝和 structuredClone，分别修改嵌套数组，再创建两个互不共享计数的闭包实例。',
      stdin: '{"project":"课程目录","tags":["frontend","accessible"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  readonly project: string;
  readonly tags: readonly string[];
};

type MutableProject = {
  project: string;
  tags: string[];
  owner: { name: string };
};

const payload = JSON.parse(readFileSync(0, 'utf8')) as Payload;
const original: MutableProject = {
  project: payload.project,
  tags: [...payload.tags],
  owner: { name: 'Ada' },
};
const alias = original;
const shallow: MutableProject = { ...original };
const deep = structuredClone(original);

alias.tags.push('shared');
shallow.owner.name = 'Grace';
deep.tags.push('isolated');

assert.equal(original, alias);
assert.equal(original.tags, shallow.tags);
assert.deepEqual(original.tags, ['frontend', 'accessible', 'shared']);
assert.equal(original.owner.name, 'Grace');
assert.equal(deep.owner.name, 'Ada');
assert.deepEqual(deep.tags, ['frontend', 'accessible', 'isolated']);

function createCounter(start: number) {
  let value = start;
  return Object.freeze({
    increment: (): number => ++value,
    read: (): number => value,
  });
}

const first = createCounter(1);
const second = createCounter(10);
assert.equal(first.increment(), 2);
assert.equal(first.increment(), 3);
assert.equal(first.read(), 3);
assert.equal(second.read(), 10);

console.log(JSON.stringify({
  tags: original.tags,
  owner: original.owner.name,
  deepOwner: deep.owner.name,
  counters: [first.read(), second.read()],
}));
console.log('引用与闭包边界通过');
`,
      checkpoint:
        '输出 tags 为 frontend、accessible、shared，owner 为 Grace，deepOwner 为 Ada，counters 为 3 和 10；最后出现“引用与闭包边界通过”且退出码为 0。把 alias 改成 structuredClone，或让 createCounter 在模块顶层共享 value，断言必须失败。',
    }),
    frontendTask({
      id: 'frontend-p02-js-reference-closure-independent',
      title: '独立实践：不可变配置与每次调用独立状态',
      brief:
        'stdin 是可能包含脏类型的环境配置。逐字段校验后冻结对象，再让两次 session 工厂调用得到独立的历史数组；任何外部修改都不能污染已发布快照。',
      stdin: '{"app":"console","retries":2,"regions":["cn-east","cn-north"],"owner":{"team":"web"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Config = {
  readonly app: string;
  readonly retries: number;
  readonly regions: readonly string[];
  readonly owner: Readonly<{ team: string }>;
};

type Session = {
  readonly push: (route: string) => readonly string[];
  readonly history: () => readonly string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('配置必须是对象');
  }
  return value as Record<string, unknown>;
}

function parseConfig(raw: unknown): Readonly<Config> {
  const row = asRecord(raw);
  if (typeof row.app !== 'string' || row.app.trim() === '') throw new Error('app 非法');
  if (typeof row.retries !== 'number' || !Number.isInteger(row.retries) || row.retries < 0) {
    throw new Error('retries 非法');
  }
  if (!Array.isArray(row.regions) || row.regions.length === 0) throw new Error('regions 非法');
  const regions = row.regions.map((region) => {
    if (typeof region !== 'string' || region.length === 0) throw new Error('region 非法');
    return region;
  });
  const owner = asRecord(row.owner);
  if (typeof owner.team !== 'string' || owner.team.length === 0) throw new Error('team 非法');
  return Object.freeze({
    app: row.app.trim(),
    retries: row.retries,
    regions: Object.freeze(regions),
    owner: Object.freeze({ team: owner.team }),
  });
}

function createSession(config: Readonly<Config>): Session {
  const entries: string[] = [];
  return Object.freeze({
    push(route: string): readonly string[] {
      if (!route.startsWith('/')) throw new Error('route 必须以 / 开始');
      entries.push(config.app + ':' + route);
      return Object.freeze([...entries]);
    },
    history(): readonly string[] {
      return Object.freeze([...entries]);
    },
  });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as unknown;
const config = parseConfig(input);
const first = createSession(config);
const second = createSession(config);
const firstView = first.push('/courses');
first.push('/settings');

assert.equal(firstView.length, 1);
assert.deepEqual(second.history(), []);
assert.deepEqual(first.history(), ['console:/courses', 'console:/settings']);
assert.notEqual(config, input);
assert.notEqual(config.owner, asRecord(input).owner);
assert.ok(Object.isFrozen(config));
assert.ok(Object.isFrozen(config.regions));
assert.throws(() => {
  (config.regions as string[]).push('mutated');
});

console.log(JSON.stringify({ config, first: first.history(), second: second.history() }));
console.log('配置快照与会话隔离通过');
`,
      checkpoint:
        '输出只有两条 first 历史且 second 为空；config 冻结，外部 push 抛错；app 为 console、retries 为 2、owner.team 为 web；最后出现“配置快照与会话隔离通过”且退出码为 0。把 regions 改成直接引用输入数组时，冻结与输入独立性检查应失败。',
    }),
  ),

  'programming:原型、对象与 this 调用规则': frontendLab(
    'P02 代码台 02 · 原型委托、显式 this 与安全字典',
    '不污染内建原型，用 Object.create、方法调用、call/bind 和 null 原型字典观察属性查找与上下文绑定。',
    frontendTask({
      id: 'frontend-p02-prototype-this-guided',
      title: '跟做：价格格式化器的原型委托',
      brief:
        'stdin 提供金额与币种。把 format 方法放在共享原型上，用不同上下文调用它，并断言实例自身字段、原型方法和绑定后函数的查找边界。',
      stdin: '{"amount":4280,"currency":"CNY"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Payload = {
  readonly amount: number;
  readonly currency: 'CNY' | 'USD';
};

type PriceContext = {
  readonly currency: string;
};

const methods = {
  format(this: PriceContext, amount: number): string {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: this.currency,
    }).format(amount / 100);
  },
};

type PriceReader = PriceContext & {
  readonly amount: number;
};

const reader = Object.create(methods) as PriceReader;
Object.defineProperty(reader, 'currency', { value: 'CNY', enumerable: true });
Object.defineProperty(reader, 'amount', { value: 4280, enumerable: true });

const input = JSON.parse(readFileSync(0, 'utf8')) as Payload;
assert.equal(reader.currency, input.currency);
assert.equal(reader.amount, input.amount);
assert.equal(Object.getPrototypeOf(reader), methods);
assert.equal(Object.hasOwn(reader, 'format'), false);
assert.equal(Object.hasOwn(methods, 'format'), true);
assert.match(reader.format(reader.amount), /42\\.80/);

const usdContext: PriceContext = { currency: 'USD' };
assert.match(reader.format.call(usdContext, 990), /\\$9\\.90/);

const bound = reader.format.bind({ currency: 'USD' });
assert.match(bound(1250), /\\$12\\.50/);

const detached = reader.format;
assert.throws(() => detached(100), TypeError);

console.log(JSON.stringify({
  ownKeys: Object.keys(reader),
  prototypeIsMethods: Object.getPrototypeOf(reader) === methods,
  cny: reader.format(reader.amount),
  usd: bound(1250),
}));
console.log('原型与 this 调用规则通过');
`,
      checkpoint:
        '输出 ownKeys 为 currency 和 amount，prototypeIsMethods 为 true，CNY 金额约 42.80，USD 金额约 12.50；直接解构调用抛出 TypeError；最后出现“原型与 this 调用规则通过”且退出码为 0。',
    }),
    frontendTask({
      id: 'frontend-p02-prototype-this-independent',
      title: '独立实践：过滤原型污染键并固定回调上下文',
      brief:
        'stdin 包含普通配置及 __proto__、constructor、prototype 键。用 null 原型对象构造安全字典，再把对象方法传给回调，分别验证丢失上下文与 bind 修复。',
      stdin: '{"theme":"dark","limit":3,"__proto__":{"polluted":true},"constructor":"bad","prototype":"bad"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type SafeRow = {
  readonly theme?: string;
  readonly limit?: number;
};

const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const raw = JSON.parse(readFileSync(0, 'utf8')) as Record<string, unknown>;
const safe = Object.create(null) as SafeRow;

for (const [key, value] of Object.entries(raw)) {
  if (blocked.has(key)) continue;
  if (key === 'theme' && typeof value === 'string') {
    Object.defineProperty(safe, key, { value: value.slice(0, 20), enumerable: true });
  }
  if (key === 'limit' && typeof value === 'number' && Number.isInteger(value)) {
    Object.defineProperty(safe, key, { value, enumerable: true });
  }
}

assert.equal(Object.getPrototypeOf(safe), null);
assert.deepEqual(Object.keys(safe).sort(), ['limit', 'theme']);
assert.equal(({} as Record<string, unknown>).polluted, undefined);

const policy = {
  prefix: 'cfg',
  key(this: { prefix: string }, name: string): string {
    return this.prefix + ':' + name;
  },
};

const detached = policy.key;
assert.throws(() => detached('theme'), TypeError);
const bound = policy.key.bind({ prefix: 'prod' });
assert.equal(bound('theme'), 'prod:theme');
assert.equal(policy.key.call({ prefix: 'test' }, 'limit'), 'test:limit');

console.log(JSON.stringify({
  safe,
  nullPrototype: Object.getPrototypeOf(safe) === null,
  bound: bound('theme'),
}));
console.log('安全字典与上下文绑定通过');
`,
      checkpoint:
        'safe 只含 theme=dark 与 limit=3，原型为 null，全局对象没有 polluted；解构方法调用抛 TypeError，bind 后输出 prod:theme；最后出现“安全字典与上下文绑定通过”且退出码为 0。',
    }),
  ),

  'programming:事件循环、Promise 与异步控制流': frontendLab(
    'P02 代码台 03 · 微任务顺序、并发上限与失败隔离',
    '用真实 Promise、queueMicrotask 和定时器验证同步栈、微任务、宏任务的顺序，再构建有上限且保留每个失败原因的异步执行器。',
    frontendTask({
      id: 'frontend-p02-event-loop-guided',
      title: '跟做：记录一轮同步、微任务和定时器',
      brief:
        'stdin 提供定时器延迟。收集同步日志，安排一个 Promise.then、一个 queueMicrotask，并在第一个微任务内继续追加微任务，等待定时器后断言完整顺序。',
      stdin: '{"delayMs":5}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly delayMs: number };
const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
if (!Number.isInteger(input.delayMs) || input.delayMs < 0) throw new Error('delayMs 非法');

const events: string[] = [];
const timer = new Promise<void>((resolve) => {
  setTimeout(() => {
    events.push('timer');
    queueMicrotask(() => events.push('timer-microtask'));
    resolve();
  }, input.delayMs);
});

Promise.resolve('promise').then(() => {
  events.push('promise');
  queueMicrotask(() => events.push('promise-nested'));
});
queueMicrotask(() => events.push('microtask'));
events.push('sync');

await timer;
await Promise.resolve();

assert.deepEqual(events, [
  'sync',
  'promise',
  'microtask',
  'promise-nested',
  'timer',
  'timer-microtask',
]);
console.log(JSON.stringify({ delayMs: input.delayMs, events }));
console.log('事件循环阶段顺序通过');
`,
      checkpoint:
        '输出顺序必须依次为 sync、promise、microtask、promise-nested、timer、timer-microtask；最后出现“事件循环阶段顺序通过”且退出码为 0。把 timer 直接显示在微任务前或漏掉嵌套微任务时，deepEqual 必须失败。',
    }),
    frontendTask({
      id: 'frontend-p02-event-loop-independent',
      title: '独立实践：有上限的异步任务池',
      brief:
        'stdin 给出多个任务及并发上限。实现固定 worker 池，记录最大同时运行数；一个失败任务不能阻止其他任务完成，结果必须保留成功、失败和耗时。',
      stdin: '{"limit":2,"jobs":[{"id":"a","delay":8},{"id":"b","delay":3},{"id":"c","delay":5,"fail":true},{"id":"d","delay":2}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Job = {
  readonly id: string;
  readonly delay: number;
  readonly fail?: boolean;
};
type Input = { readonly limit: number; readonly jobs: readonly Job[] };
type Result =
  | { readonly id: string; readonly status: 'ok'; readonly elapsedMs: number }
  | { readonly id: string; readonly status: 'failed'; readonly code: string; readonly elapsedMs: number };

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error('limit 非法');
if (input.jobs.length === 0) throw new Error('jobs 不能为空');

let active = 0;
let maxActive = 0;
let cursor = 0;
const results = new Array<Result>(input.jobs.length);

async function runJob(job: Job): Promise<Result> {
  const started = Date.now();
  await new Promise<void>((resolve) => setTimeout(resolve, job.delay));
  const elapsedMs = Date.now() - started;
  if (job.fail) return { id: job.id, status: 'failed', code: 'JOB_' + job.id.toUpperCase(), elapsedMs };
  return { id: job.id, status: 'ok', elapsedMs };
}

async function worker(): Promise<void> {
  while (cursor < input.jobs.length) {
    const index = cursor++;
    const job = input.jobs[index];
    if (!job) throw new Error('任务索引越界');
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      results[index] = await runJob(job);
    } finally {
      active -= 1;
    }
  }
}

const workers = Math.min(input.limit, input.jobs.length);
await Promise.all(Array.from({ length: workers }, () => worker()));

assert.equal(maxActive <= input.limit, true);
assert.equal(results.length, input.jobs.length);
assert.deepEqual(results.map((result) => result.id), ['a', 'b', 'c', 'd']);
assert.equal(results.filter((result) => result.status === 'failed').length, 1);
assert.equal(results.find((result) => result.id === 'c')?.status, 'failed');

console.log(JSON.stringify({ maxActive, limit: input.limit, results }));
console.log('并发上限与失败隔离通过');
`,
      checkpoint:
        '输出 maxActive 不大于 limit=2，四个任务都有结果，只有 c 为 failed，其他为 ok；最后出现“并发上限与失败隔离通过”且退出码为 0。把 Promise.all 改成一次性启动全部任务时 maxActive 会超过 2，断言应失败。',
    }),
  ),

  'programming:TypeScript 类型系统与企业 API 契约': frontendLab(
    'P02 代码台 04 · 运行时边界、判别联合与版本兼容',
    '从 unknown 解析企业 API 数据，用判别联合封闭状态，再建立 V1/V2 双向兼容层；类型只描述意图，运行时验证才决定数据能否进入领域层。',
    frontendTask({
      id: 'frontend-p02-ts-contract-guided',
      title: '跟做：不可信 JSON 到订单联合',
      brief:
        'stdin 是一张订单。逐字段验证 id、金额、币种和状态；只有解析成功后才返回判别联合。用 switch 与 never 生成摘要，并验证非法负数金额被拒绝。',
      stdin: '{"id":"O-42","amountCents":12800,"currency":"CNY","status":"paid","paidAt":"2026-11-24"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Order =
  | { readonly status: 'pending'; readonly id: string; readonly amountCents: number; readonly currency: 'CNY' }
  | { readonly status: 'paid'; readonly id: string; readonly amountCents: number; readonly currency: 'CNY'; readonly paidAt: string }
  | { readonly status: 'cancelled'; readonly id: string; readonly reason: string };

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('ORDER_OBJECT');
  return value as Record<string, unknown>;
}

function parseOrder(value: unknown): Order {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || !/^O-[0-9]+$/.test(row.id)) throw new Error('ORDER_ID');
  if (row.currency !== 'CNY') throw new Error('ORDER_CURRENCY');
  if (row.status === 'cancelled') {
    if (typeof row.reason !== 'string' || row.reason.trim() === '') throw new Error('ORDER_REASON');
    return { status: 'cancelled', id: row.id, reason: row.reason.trim() };
  }
  if (typeof row.amountCents !== 'number' || !Number.isInteger(row.amountCents) || row.amountCents < 0) {
    throw new Error('ORDER_AMOUNT');
  }
  if (row.status === 'pending') {
    return { status: 'pending', id: row.id, amountCents: row.amountCents, currency: 'CNY' };
  }
  if (row.status === 'paid') {
    if (typeof row.paidAt !== 'string') throw new Error('ORDER_PAID_AT');
    return {
      status: 'paid',
      id: row.id,
      amountCents: row.amountCents,
      currency: 'CNY',
      paidAt: row.paidAt,
    };
  }
  throw new Error('ORDER_STATUS');
}

function assertNever(value: never): never {
  throw new Error('UNHANDLED_' + JSON.stringify(value));
}

function summarize(order: Order): string {
  switch (order.status) {
    case 'pending': return order.id + ':pending:' + order.amountCents;
    case 'paid': return order.id + ':paid:' + order.paidAt;
    case 'cancelled': return order.id + ':cancelled:' + order.reason;
    default: return assertNever(order);
  }
}

const order = parseOrder(JSON.parse(readFileSync(0, 'utf8')) as unknown);
assert.equal(summarize(order), 'O-42:paid:2026-11-24');
assert.throws(() => parseOrder({ id: 'O-1', amountCents: -1, currency: 'CNY', status: 'pending' }), /ORDER_AMOUNT/);
assert.throws(() => parseOrder({ id: 'bad', amountCents: 1, currency: 'CNY', status: 'pending' }), /ORDER_ID/);

console.log(JSON.stringify(order));
console.log(summarize(order));
`,
      checkpoint:
        '输出订单包含 O-42、12800、CNY 和 paid，第二行摘要为 O-42:paid:2026-11-24，退出码为 0。若用 as Order 跳过运行时字段检查，非法数量与非法 id 的断言必须失败。',
    }),
    frontendTask({
      id: 'frontend-p02-ts-contract-independent',
      title: '独立实践：V1 到 V2 的兼容适配',
      brief:
        'stdin 提供旧版订单与目标版本。实现 V1/V2 双向转换、版本校验和弃用字段提示；未知版本必须返回稳定错误 code，不能靠 any 直接透传。',
      stdin: '{"apiVersion":"1","order":{"id":"O-7","totalCents":9900,"status":"paid"}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type OrderV1 = { readonly id: string; readonly totalCents: number; readonly status: 'pending' | 'paid' };
type OrderV2 = {
  readonly id: string;
  readonly totalCents: number;
  readonly status: 'pending' | 'paid';
  readonly currency: 'CNY';
  readonly displayTotal: string;
};
type Result<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly code: string };

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('OBJECT');
  return value as Record<string, unknown>;
}

function parseV1(value: unknown): OrderV1 {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || row.id.length === 0) throw new Error('ID');
  if (typeof row.totalCents !== 'number' || !Number.isInteger(row.totalCents) || row.totalCents < 0) {
    throw new Error('TOTAL');
  }
  if (row.status !== 'pending' && row.status !== 'paid') throw new Error('STATUS');
  return { id: row.id, totalCents: row.totalCents, status: row.status };
}

function toV2(order: OrderV1): OrderV2 {
  return {
    ...order,
    currency: 'CNY',
    displayTotal: '¥' + (order.totalCents / 100).toFixed(2),
  };
}

function toV1(order: OrderV2): OrderV1 {
  return { id: order.id, totalCents: order.totalCents, status: order.status };
}

const request = asRecord(JSON.parse(readFileSync(0, 'utf8')) as unknown);
let result: Result<OrderV2>;
if (request.apiVersion === '1') {
  try {
    const v1 = parseV1(request.order);
    result = { ok: true, value: toV2(v1), warnings: ['v1.totalCents will be removed in 2027-06'] };
  } catch (error) {
    result = { ok: false, code: 'INVALID_V1_' + (error instanceof Error ? error.message : 'UNKNOWN') };
  }
} else {
  result = { ok: false, code: 'UNSUPPORTED_API_VERSION' };
}

assert.equal(result.ok, true);
if (!result.ok) throw new Error(result.code);
assert.equal(result.value.displayTotal, '¥99.00');
assert.deepEqual(toV1(result.value), { id: 'O-7', totalCents: 9900, status: 'paid' });
assert.match(result.warnings[0] ?? '', /2027-06/);

const unsupported = { apiVersion: '3' };
const unsupportedResult: Result<OrderV2> = unsupported.apiVersion === '1'
  ? result
  : { ok: false, code: 'UNSUPPORTED_API_VERSION' };
assert.deepEqual(unsupportedResult, { ok: false, code: 'UNSUPPORTED_API_VERSION' });

console.log(JSON.stringify({ result, roundTrip: toV1(result.value) }));
console.log('API 版本兼容层通过');
`,
      checkpoint:
        '输出 value.displayTotal 为 ¥99.00，roundTrip 与输入 V1 完全一致，warnings 含 2027-06；apiVersion 改成 3 时返回 UNSUPPORTED_API_VERSION；最后出现“API 版本兼容层通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 响应式原理与组合式状态': frontendLab(
    'P03 代码台 01 · 依赖追踪、派生缓存与批量调度',
    '用代理和依赖表模拟响应式读取与写入，用脏标记实现派生缓存，再用微任务队列合并同一轮写入；这些实验不加载真实框架运行时。',
    frontendTask({
      id: 'frontend-p03-reactivity-guided',
      title: '跟做：最小依赖追踪与派生值',
      brief:
        'stdin 提供单价和数量。实现 reactive 代理，读取属性时记录当前 effect，写入时只触发依赖该属性的 effect；再建立派生总价并统计计算次数。',
      stdin: '{"price":42,"quantity":2}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly price: number; readonly quantity: number };
type Effect = () => void;

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const effects = new Map<string, Set<Effect>>();
let activeEffect: Effect | undefined;
let totalRuns = 0;
let total = 0;

function track(key: string): void {
  if (!activeEffect) return;
  const bucket = effects.get(key) ?? new Set<Effect>();
  bucket.add(activeEffect);
  effects.set(key, bucket);
}

function trigger(key: string): void {
  for (const effect of [...(effects.get(key) ?? [])]) effect();
}

function reactive<T extends object>(value: T): T {
  return new Proxy(value, {
    get(target, property, receiver) {
      if (typeof property === 'string') track(property);
      return Reflect.get(target, property, receiver);
    },
    set(target, property, next, receiver) {
      const changed = Reflect.get(target, property, receiver) !== next;
      const result = Reflect.set(target, property, next, receiver);
      if (changed && typeof property === 'string') trigger(property);
      return result;
    },
  });
}

function watchEffect(effect: Effect): void {
  activeEffect = effect;
  try {
    effect();
  } finally {
    activeEffect = undefined;
  }
}

const state = reactive({ price: input.price, quantity: input.quantity, note: 'draft' });
watchEffect(() => {
  totalRuns += 1;
  total = state.price * state.quantity;
});

assert.equal(total, 84);
assert.equal(totalRuns, 1);
state.note = 'published';
assert.equal(totalRuns, 1);
state.quantity = 3;
assert.equal(total, 126);
assert.equal(totalRuns, 2);
state.quantity = 3;
assert.equal(totalRuns, 2);

console.log(JSON.stringify({ total, totalRuns, dependencies: [...effects.keys()].sort() }));
console.log('依赖追踪与无关更新隔离通过');
`,
      checkpoint:
        '最终 total 为 126、totalRuns 为 2，依赖键只含 price 和 quantity；修改 note 或写回相同 quantity 不触发重算；最后出现“依赖追踪与无关更新隔离通过”且退出码为 0。',
    }),
    frontendTask({
      id: 'frontend-p03-reactivity-independent',
      title: '独立实践：微任务批量刷新与停止订阅',
      brief:
        'stdin 给出两次连续价格更新。实现同一轮只调度一次刷新，刷新读取最终值；再提供 stop 让写入不再触发订阅，断言停止前后日志。',
      stdin: '{"initial":10,"first":20,"second":35}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly initial: number; readonly first: number; readonly second: number };
type Subscriber = () => void;

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
let value = input.initial;
let queued = false;
let visible = value;
let flushes = 0;
const subscribers = new Set<Subscriber>();

function flush(): void {
  queued = false;
  flushes += 1;
  for (const subscriber of [...subscribers]) subscriber();
}

function schedule(): void {
  if (queued) return;
  queued = true;
  queueMicrotask(flush);
}

function setValue(next: number): void {
  if (value === next) return;
  value = next;
  schedule();
}

function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

const stop = subscribe(() => {
  visible = value;
});

setValue(input.first);
setValue(input.second);
assert.equal(visible, input.initial);
await Promise.resolve();
assert.equal(visible, input.second);
assert.equal(flushes, 1);

stop();
setValue(99);
await Promise.resolve();
assert.equal(visible, input.second);
assert.equal(flushes, 2);
assert.equal(subscribers.size, 0);

console.log(JSON.stringify({ visible, flushes, queued }));
console.log('批量刷新与停止订阅通过');
`,
      checkpoint:
        '两次同步写入后 visible 先保持初始值，微任务后一次变到 35，flushes 为 1；stop 后写 99 不再改变 visible，最终 subscribers.size 为 0；最后出现“批量刷新与停止订阅通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 组件、组合式 API 与工程边界': frontendLab(
    'P03 代码台 02 · 组件契约、局部状态与事件所有权',
    '通过运行时 props 解析、事件白名单和工厂函数模拟组件边界，证明输入校验、子组件不可写父状态、以及每个会话拥有独立状态。',
    frontendTask({
      id: 'frontend-p03-component-contract-guided',
      title: '跟做：运行时校验 props 与 emit',
      brief:
        'stdin 提供卡片 props 与一组 emit 请求。校验 title、disabled 和 tone；只接受 save、cancel 两类事件，载荷不合法时返回稳定失败原因。',
      stdin: '{"title":"订单 A","disabled":false,"tone":"warning","events":[{"type":"save","draft":"已核对"},{"type":"delete"}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Props = {
  readonly title: string;
  readonly disabled: boolean;
  readonly tone: 'neutral' | 'warning';
};
type Emit =
  | { readonly type: 'save'; readonly draft: string }
  | { readonly type: 'cancel'; readonly reason: string };
type EventResult =
  | { readonly ok: true; readonly emit: Emit }
  | { readonly ok: false; readonly code: string };

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('OBJECT');
  return value as Record<string, unknown>;
}

function parseProps(value: unknown): Props {
  const row = asRecord(value);
  if (typeof row.title !== 'string' || row.title.trim().length < 1 || row.title.length > 40) {
    throw new Error('PROP_TITLE');
  }
  if (typeof row.disabled !== 'boolean') throw new Error('PROP_DISABLED');
  if (row.tone !== 'neutral' && row.tone !== 'warning') throw new Error('PROP_TONE');
  return { title: row.title.trim(), disabled: row.disabled, tone: row.tone };
}

function parseEmit(value: unknown, props: Props): EventResult {
  const row = asRecord(value);
  if (props.disabled) return { ok: false, code: 'COMPONENT_DISABLED' };
  if (row.type === 'save') {
    if (typeof row.draft !== 'string' || row.draft.trim() === '') return { ok: false, code: 'SAVE_DRAFT' };
    return { ok: true, emit: { type: 'save', draft: row.draft.trim() } };
  }
  if (row.type === 'cancel') {
    if (typeof row.reason !== 'string' || row.reason.trim() === '') return { ok: false, code: 'CANCEL_REASON' };
    return { ok: true, emit: { type: 'cancel', reason: row.reason.trim() } };
  }
  return { ok: false, code: 'UNKNOWN_EVENT' };
}

const request = asRecord(JSON.parse(readFileSync(0, 'utf8')) as unknown);
const props = parseProps(request);
if (!Array.isArray(request.events)) throw new Error('EVENTS');
const results = request.events.map((event) => parseEmit(event, props));

assert.deepEqual(results[0], { ok: true, emit: { type: 'save', draft: '已核对' } });
assert.deepEqual(results[1], { ok: false, code: 'UNKNOWN_EVENT' });
assert.deepEqual(parseEmit({ type: 'cancel', reason: '' }, props), { ok: false, code: 'CANCEL_REASON' });
assert.deepEqual(parseEmit({ type: 'save', draft: 'x' }, { ...props, disabled: true }), {
  ok: false,
  code: 'COMPONENT_DISABLED',
});

console.log(JSON.stringify({ props, results }));
console.log('组件输入与事件白名单通过');
`,
      checkpoint:
        '第一个事件成功产生 save 与“已核对”，delete 返回 UNKNOWN_EVENT，空 cancel 原因和 disabled 状态被拒绝；最后出现“组件输入与事件白名单通过”且退出码为 0。删除 tone 白名单或允许任意 type 时，预期结果应变化并使断言失败。',
    }),
    frontendTask({
      id: 'frontend-p03-component-contract-independent',
      title: '独立实践：组合函数实例隔离与提交状态机',
      brief:
        'stdin 给两个请求各自的用户。创建独立组合状态，验证 requestA 登录不会污染 requestB；再用 idle、submitting、success、error 状态机拒绝非法重复提交。',
      stdin: '{"requestA":"Ada","requestB":"Grace"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly requestA: string; readonly requestB: string };
type SubmitState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting'; readonly requestId: string }
  | { readonly kind: 'success'; readonly orderId: string }
  | { readonly kind: 'error'; readonly code: string; readonly retryable: boolean };

type Session = {
  readonly user: () => string | null;
  readonly signIn: (name: string) => void;
  readonly state: () => SubmitState;
  readonly dispatch: (event: 'submit' | 'success' | 'fail' | 'reset') => SubmitState;
};

function createSession(requestId: string): Session {
  let user: string | null = null;
  let state: SubmitState = { kind: 'idle' };
  return Object.freeze({
    user: () => user,
    signIn(name: string): void {
      if (name.trim() === '') throw new Error('USER_EMPTY');
      user = name.trim();
    },
    state: () => state,
    dispatch(event: 'submit' | 'success' | 'fail' | 'reset'): SubmitState {
      if (event === 'submit' && state.kind === 'idle') {
        state = { kind: 'submitting', requestId };
      } else if (event === 'success' && state.kind === 'submitting') {
        state = { kind: 'success', orderId: 'O-' + requestId };
      } else if (event === 'fail' && state.kind === 'submitting') {
        state = { kind: 'error', code: 'NETWORK', retryable: true };
      } else if (event === 'reset' && (state.kind === 'success' || state.kind === 'error')) {
        state = { kind: 'idle' };
      } else {
        throw new Error('ILLEGAL_TRANSITION_' + state.kind + '_' + event);
      }
      return state;
    },
  });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const requestA = createSession('a');
const requestB = createSession('b');
requestA.signIn(input.requestA);

assert.equal(requestA.user(), 'Ada');
assert.equal(requestB.user(), null);
assert.deepEqual(requestA.dispatch('submit'), { kind: 'submitting', requestId: 'a' });
assert.throws(() => requestA.dispatch('submit'), /ILLEGAL_TRANSITION/);
assert.deepEqual(requestA.dispatch('success'), { kind: 'success', orderId: 'O-a' });
assert.deepEqual(requestA.dispatch('reset'), { kind: 'idle' });
requestB.signIn(input.requestB);
assert.equal(requestB.user(), 'Grace');
assert.equal(requestA.user(), 'Ada');

console.log(JSON.stringify({ a: requestA.user(), b: requestB.user(), aState: requestA.state() }));
console.log('组合状态隔离与提交状态机通过');
`,
      checkpoint:
        'requestA 用户为 Ada、requestB 为 Grace，两个会话互不覆盖；A 的提交在 submitting 时再次 submit 抛 ILLEGAL_TRANSITION；成功后 orderId 为 O-a；最后出现“组合状态隔离与提交状态机通过”且退出码为 0。',
    }),
  ),

  'programming:Vue Router、Pinia 与请求状态': frontendLab(
    'P03 代码台 03 · 路由守卫、URL 恢复与请求竞态',
    '在无框架运行时中模拟路由匹配与两级守卫，再建立带 UI 状态、请求代号、取消和失效条件的查询缓存。',
    frontendTask({
      id: 'frontend-p03-vue-router-guided',
      title: '跟做：路径参数、权限与安全返回地址',
      brief:
        'stdin 提供目标路径、登录状态和角色。匹配 /orders/:id；未登录跳转 login 并携带站内 redirect，已登录但角色不足跳 forbidden，站外 redirect 必须丢弃。',
      stdin: '{"path":"/orders/O-42","authenticated":false,"role":"viewer","redirect":"/orders/O-42"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly path: string;
  readonly authenticated: boolean;
  readonly role: 'admin' | 'viewer';
  readonly redirect: string;
};
type Route =
  | { readonly name: 'order'; readonly params: { readonly id: string } }
  | { readonly name: 'login'; readonly query: { readonly redirect: string } }
  | { readonly name: 'forbidden' }
  | { readonly name: 'not-found' };

function safeRedirect(value: string): string | null {
  return value.startsWith('/') && !value.startsWith('//') ? value : null;
}

function resolve(input: Input): Route {
  if (!input.authenticated) {
    const redirect = safeRedirect(input.redirect);
    return { name: 'login', query: { redirect: redirect ?? '/' } };
  }
  const match = /^\\/orders\\/(O-[0-9]+)$/.exec(input.path);
  if (!match) return { name: 'not-found' };
  if (input.role !== 'admin') return { name: 'forbidden' };
  return { name: 'order', params: { id: match[1] ?? '' } };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const unauthenticated = resolve(input);
assert.deepEqual(unauthenticated, {
  name: 'login',
  query: { redirect: '/orders/O-42' },
});
assert.deepEqual(resolve({ ...input, authenticated: true, role: 'viewer' }), { name: 'forbidden' });
assert.deepEqual(resolve({ ...input, authenticated: true, role: 'admin' }), {
  name: 'order',
  params: { id: 'O-42' },
});
assert.deepEqual(resolve({ ...input, redirect: 'https://evil.example' }), {
  name: 'login',
  query: { redirect: '/' },
});

console.log(JSON.stringify({ unauthenticated, admin: resolve({ ...input, authenticated: true, role: 'admin' }) }));
console.log('路由匹配与两级守卫通过');
`,
      checkpoint:
        '未登录结果为 login 且 redirect 为 /orders/O-42；viewer 得到 forbidden；admin 得到 order 参数 O-42；外部 redirect 被替换为 /；最后出现“路由匹配与两级守卫通过”且退出码为 0。',
    }),
    frontendTask({
      id: 'frontend-p03-vue-router-independent',
      title: '独立实践：查询缓存、取消与旧请求防覆盖',
      brief:
        'stdin 给两个筛选词。实现 deferred 请求器，让 slow 先发、fast 后发但 fast 先完成，再让 slow 晚到；最终只显示 fast。成功后使缓存失效并确认重新请求。',
      stdin: '{"slow":"O-1","fast":"O-2"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly slow: string; readonly fast: string };
type Deferred = {
  readonly promise: Promise<string>;
  readonly resolve: (value: string) => void;
};

function deferred(): Deferred {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createStore() {
  const cache = new Map<string, string>();
  let generation = 0;
  let visible = '';
  let loads = 0;
  return {
    visible: () => visible,
    cacheSize: () => cache.size,
    loads: () => loads,
    async load(key: string, request: Promise<string>, bypassCache = false): Promise<void> {
      const current = ++generation;
      loads += 1;
      if (!bypassCache && cache.has(key)) {
        visible = cache.get(key) ?? '';
        return;
      }
      const value = await request;
      if (current !== generation) return;
      cache.set(key, value);
      visible = value;
    },
    invalidate(key: string): void {
      cache.delete(key);
    },
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const store = createStore();
const slow = deferred();
const fast = deferred();
const slowRun = store.load('slow', slow.promise);
const fastRun = store.load('fast', fast.promise);
fast.resolve('result:' + input.fast);
await fastRun;
slow.resolve('result:' + input.slow);
await slowRun;

assert.equal(store.visible(), 'result:O-2');
assert.equal(store.cacheSize(), 1);
store.invalidate('fast');
await store.load('fast', Promise.resolve('result:fresh'));
assert.equal(store.visible(), 'result:fresh');
assert.equal(store.loads(), 3);

console.log(JSON.stringify({ visible: store.visible(), cacheSize: store.cacheSize(), loads: store.loads() }));
console.log('查询竞态与失效重取通过');
`,
      checkpoint:
        'fast 完成后 visible 为 result:O-2，slow 晚到不能覆盖；缓存中只有 fast；invalidate 后重新请求得到 result:fresh，累计 loads 为 3；最后出现“查询竞态与失效重取通过”且退出码为 0。',
    }),
  ),

  'programming:Vue 源码与 Nuxt SSR 部署': frontendLab(
    'P03 代码台 04 · 请求级 SSR 快照、路由规则与回滚',
    '模拟 SSR 序列化、转义、hydration 对比与部署清单；实验只证明服务端快照和路由规则契约，不声称执行 Nuxt 编译器。',
    frontendTask({
      id: 'frontend-p03-nuxt-ssr-guided',
      title: '跟做：可序列化且可比较的 SSR 快照',
      brief:
        'stdin 提供用户显示名、请求 id 和路由。生成稳定顺序的 SSR 快照，把危险 HTML 字符转义为 JSON 安全内容，并断言同一输入产生相同快照、不包含浏览器全局。',
      stdin: '{"displayName":"<img src=x onerror=alert(1)>","requestId":"req-8","route":"/orders/42"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly displayName: string;
  readonly requestId: string;
  readonly route: string;
};
type Snapshot = {
  readonly requestId: string;
  readonly route: string;
  readonly html: string;
  readonly state: Readonly<{ displayName: string; hydrated: false }>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function render(input: Input): Snapshot {
  if (!/^[a-z0-9-]+$/i.test(input.requestId)) throw new Error('REQUEST_ID');
  if (!input.route.startsWith('/')) throw new Error('ROUTE');
  const state = Object.freeze({ displayName: input.displayName, hydrated: false } as const);
  const html = '<main data-request="' + escapeHtml(input.requestId) + '"><h1>订单</h1><p>' +
    escapeHtml(input.displayName) + '</p></main>';
  return Object.freeze({ requestId: input.requestId, route: input.route, html, state });
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const first = render(input);
const second = render(input);
assert.deepEqual(first, second);
assert.match(first.html, /&lt;img/);
assert.doesNotMatch(first.html, /<img/i);
assert.equal(first.state.hydrated, false);
assert.equal(JSON.stringify(first).includes('window'), false);
assert.throws(() => render({ ...input, route: 'orders' }), /ROUTE/);

console.log(JSON.stringify(first));
console.log('SSR 快照转义与确定性通过');
`,
      checkpoint:
        '两次渲染完全相等；html 只含 &lt;img，不含可执行 img；state.hydrated 为 false；序列化结果不含 window；非法相对路由抛 ROUTE；最后出现“SSR 快照转义与确定性通过”且退出码为 0。',
    }),
    frontendTask({
      id: 'frontend-p03-nuxt-ssr-independent',
      title: '独立实践：SSR 路由规则与版本回滚门禁',
      brief:
        'stdin 提供静态、SSR 和 SWR 路由及发布清单。生成部署计划，验证私密路由必须 SSR 且禁止缓存；回滚时版本、API 契约和健康检查必须同时匹配。',
      stdin: '{"routes":[{"path":"/","mode":"swr","swr":60},{"path":"/account","mode":"ssr","private":true},{"path":"/help","mode":"static"}],"release":{"current":"web-12","target":"web-11","api":"orders-v2","health":true}}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type RouteInput = {
  readonly path: string;
  readonly mode: 'static' | 'ssr' | 'swr';
  readonly swr?: number;
  readonly private?: boolean;
};
type Release = {
  readonly current: string;
  readonly target: string;
  readonly api: string;
  readonly health: boolean;
};
type Input = { readonly routes: readonly RouteInput[]; readonly release: Release };
type RoutePlan = {
  readonly path: string;
  readonly mode: 'static' | 'ssr' | 'swr';
  readonly cacheControl: string;
};

function planRoute(route: RouteInput): RoutePlan {
  if (!route.path.startsWith('/')) throw new Error('ROUTE_PATH');
  if (route.mode === 'static') {
    return { path: route.path, mode: 'static', cacheControl: 'public, max-age=31536000, immutable' };
  }
  if (route.mode === 'ssr') {
    return { path: route.path, mode: 'ssr', cacheControl: route.private ? 'private, no-store' : 'no-cache' };
  }
  if (!Number.isInteger(route.swr) || (route.swr ?? 0) < 1) throw new Error('SWR_TTL');
  return { path: route.path, mode: 'swr', cacheControl: 'public, s-maxage=' + route.swr + ', stale-while-revalidate=30' };
}

function authorizeRollback(release: Release): { readonly ok: boolean; readonly code: string } {
  if (!release.health) return { ok: false, code: 'HEALTH_FAILED' };
  if (release.current === release.target) return { ok: false, code: 'SAME_RELEASE' };
  if (!/^web-[0-9]+$/.test(release.target)) return { ok: false, code: 'INVALID_RELEASE' };
  if (!/^orders-v[0-9]+$/.test(release.api)) return { ok: false, code: 'API_INCOMPATIBLE' };
  return { ok: true, code: 'ROLLBACK_ALLOWED' };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const plans = input.routes.map(planRoute);
const account = plans.find((plan) => plan.path === '/account');
assert.ok(account);
assert.equal(account.mode, 'ssr');
assert.equal(account.cacheControl, 'private, no-store');
assert.equal(plans.find((plan) => plan.path === '/')?.cacheControl.includes('s-maxage=60'), true);
assert.deepEqual(authorizeRollback(input.release), { ok: true, code: 'ROLLBACK_ALLOWED' });
assert.deepEqual(authorizeRollback({ ...input.release, health: false }), { ok: false, code: 'HEALTH_FAILED' });
assert.deepEqual(authorizeRollback({ ...input.release, current: 'web-11' }), { ok: false, code: 'SAME_RELEASE' });
assert.throws(() => planRoute({ path: '/broken', mode: 'swr' }), /SWR_TTL/);

console.log(JSON.stringify({ plans, rollback: authorizeRollback(input.release) }));
console.log('SSR 路由规则与回滚门禁通过');
`,
      checkpoint:
        '根路由使用 SWR 且 s-maxage=60；/account 使用 SSR 并返回 private, no-store；/help 为静态长缓存；健康检查失败和同版本回滚被拒绝；缺 SWR 秒数抛错；最后出现“SSR 路由规则与回滚门禁通过”且退出码为 0。',
    }),
  ),

  'programming:React 组件、状态与表单': frontendLab(
    'P04 代码台 01 · 不可变 reducer 与表单联合状态',
    '用纯 reducer 模拟组件状态更新，验证实体、数组和嵌套对象的新旧引用，再建立带校验、提交、成功和失败的互斥表单状态机。',
    frontendTask({
      id: 'frontend-p04-react-state-guided',
      title: '跟做：不可变列表与版本补丁',
      brief:
        'stdin 提供订单行和乱序到达的版本补丁。reducer 只接受更高版本，保留未命中对象引用，冻结旧快照，并断言旧状态没有被原地修改。',
      stdin: '{"rows":[{"id":"a","title":"旧 A","version":1},{"id":"b","title":"旧 B","version":3}],"patches":[{"id":"a","title":"新 A","version":2},{"id":"b","title":"新 B","version":4},{"id":"a","title":"迟到 A","version":2}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Row = { readonly id: string; readonly title: string; readonly version: number };
type Patch = { readonly id: string; readonly title: string; readonly version: number };
type Input = { readonly rows: readonly Row[]; readonly patches: readonly Patch[] };
type Action = { readonly type: 'patch'; readonly patch: Patch };

function reducer(state: readonly Row[], action: Action): readonly Row[] {
  const existing = state.find((row) => row.id === action.patch.id);
  if (!existing) throw new Error('UNKNOWN_ROW');
  if (action.patch.version <= existing.version) return state;
  return Object.freeze(state.map((row) =>
    row.id === action.patch.id
      ? Object.freeze({ ...row, title: action.patch.title, version: action.patch.version })
      : row,
  ));
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const original = Object.freeze(input.rows.map((row) => Object.freeze({ ...row })));
const originalA = original.find((row) => row.id === 'a');
const originalB = original.find((row) => row.id === 'b');
assert.ok(originalA && originalB);

let current: readonly Row[] = original;
current = reducer(current, { type: 'patch', patch: input.patches[0]! });
current = reducer(current, { type: 'patch', patch: input.patches[1]! });
const beforeIgnored = current;
current = reducer(current, { type: 'patch', patch: input.patches[2]! });

assert.equal(current, beforeIgnored);
assert.notEqual(current.find((row) => row.id === 'a'), originalA);
assert.notEqual(current.find((row) => row.id === 'b'), originalB);
assert.equal(originalA.title, '旧 A');
assert.equal(originalB.title, '旧 B');
assert.equal(current.find((row) => row.id === 'a')?.title, '新 A');
assert.equal(current.find((row) => row.id === 'b')?.version, 4);

console.log(JSON.stringify({ current, original }));
console.log('不可变 reducer 与版本保护通过');
`,
      checkpoint:
        'current 为 A:2 和 B:4，original 仍为旧标题与旧版本；迟到同版本补丁返回原数组引用；旧对象引用未被修改；最后出现“不可变 reducer 与版本保护通过”且退出码为 0。',
    }),
    frontendTask({
      id: 'frontend-p04-react-state-independent',
      title: '独立实践：表单校验与提交状态机',
      brief:
        'stdin 给邮箱和金额。表单先校验，再进入 submitting，成功后 success；网络失败可重试。任何重复提交、无校验提交和无错误恢复的转场都必须被拒绝。',
      stdin: '{"email":"ada@example.com","amount":"128.50","network":"fail"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly email: string; readonly amount: string; readonly network: 'ok' | 'fail' };
type FormState =
  | { readonly kind: 'idle'; readonly errors: Readonly<Record<string, string>> }
  | { readonly kind: 'validating'; readonly email: string; readonly amountCents: number }
  | { readonly kind: 'submitting'; readonly email: string; readonly amountCents: number; readonly requestId: string }
  | { readonly kind: 'success'; readonly orderId: string }
  | { readonly kind: 'error'; readonly code: string; readonly retryable: boolean; readonly email: string; readonly amountCents: number };

function validate(email: string, amount: string): { readonly email: string; readonly amountCents: number; readonly errors: Readonly<Record<string, string>> } {
  const errors: Record<string, string> = {};
  const normalizedEmail = email.trim();
  const amountCents = Math.round(Number(amount) * 100);
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(normalizedEmail)) errors.email = 'EMAIL_FORMAT';
  if (!Number.isInteger(amountCents) || amountCents <= 0) errors.amount = 'AMOUNT_POSITIVE';
  return { email: normalizedEmail, amountCents, errors: Object.freeze(errors) };
}

function submit(state: FormState, network: 'ok' | 'fail'): FormState {
  if (state.kind === 'idle') {
    const checked = validate(state.errors.email ?? '', state.errors.amount ?? '');
    if (Object.keys(state.errors).length > 0) throw new Error('FIX_ERRORS');
    return { kind: 'validating', email: checked.email, amountCents: checked.amountCents };
  }
  if (state.kind === 'validating') {
    return { kind: 'submitting', email: state.email, amountCents: state.amountCents, requestId: 'req-501' };
  }
  if (state.kind === 'submitting') {
    if (network === 'fail') {
      return { kind: 'error', code: 'NETWORK', retryable: true, email: state.email, amountCents: state.amountCents };
    }
    return { kind: 'success', orderId: 'O-501' };
  }
  throw new Error('ILLEGAL_TRANSITION_' + state.kind);
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const checked = validate(input.email, input.amount);
assert.deepEqual(checked.errors, {});
assert.equal(checked.amountCents, 12850);

let state: FormState = { kind: 'idle', errors: {} };
state = submit(state, input.network);
assert.equal(state.kind, 'validating');
state = submit(state, input.network);
assert.equal(state.kind, 'submitting');
state = submit(state, input.network);
assert.equal(state.kind, 'error');
if (state.kind !== 'error') throw new Error('EXPECTED_ERROR');
assert.equal(state.retryable, true);

const invalid = validate('not-an-email', '-1');
assert.deepEqual(invalid.errors, {
  email: 'EMAIL_FORMAT',
  amount: 'AMOUNT_POSITIVE',
});
assert.throws(() => submit({ kind: 'success', orderId: 'O-501' }, 'ok'), /ILLEGAL_TRANSITION/);

console.log(JSON.stringify({ checked, state, invalid }));
console.log('表单校验与互斥转场通过');
`,
      checkpoint:
        '正常输入得到 amountCents=12850；状态依次经过 validating、submitting、error，错误可重试；非法邮箱和负数金额同时返回稳定 code；success 状态再次提交抛 ILLEGAL_TRANSITION；最后出现“表单校验与互斥转场通过”且退出码为 0。',
    }),
  ),

  'programming:React Hooks、渲染与副作用边界': frontendLab(
    'P04 代码台 02 · Hook 顺序、依赖比较与清理顺序',
    '模拟每次渲染的 Hook 槽位和 Effect 依赖数组，验证条件调用造成槽位错位、依赖变化触发旧 cleanup 再执行新 effect、卸载时清空全部资源。',
    frontendTask({
      id: 'frontend-p04-hooks-order-guided',
      title: '跟做：检测条件 Hook 的槽位错位',
      brief:
        'stdin 给两次渲染的 Hook 名称序列。运行时按索引记录槽位；第二次序列少一项时抛出清晰错误，恢复稳定顺序后两次 value 槽位必须保持同一身份。',
      stdin: '{"first":["useState","useEffect","useState"],"second":["useState","useState"],"fixed":["useState","useEffect","useState"]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly first: readonly string[];
  readonly second: readonly string[];
  readonly fixed: readonly string[];
};
type Slot = { readonly hook: string; readonly token: object };

function createRuntime(component: string) {
  let slots: readonly Slot[] = Object.freeze([]);
  let committedSignature = '';
  return {
    render(hooks: readonly string[]): readonly Slot[] {
      const previous = slots;
      const next = hooks.map((hook, index) => {
        const old = previous[index];
        return Object.freeze({ hook, token: old?.hook === hook ? old.token : Object.freeze({ index, hook }) });
      });
      const signature = hooks.join('>');
      if (committedSignature && committedSignature !== signature) {
        throw new Error('HOOK_ORDER_CHANGED:' + component + ':' + committedSignature + '->' + signature);
      }
      committedSignature = signature;
      slots = Object.freeze(next);
      return slots;
    },
    slots: () => slots,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const runtime = createRuntime('Profile');
const first = runtime.render(input.first);
const valueBeforeError = first[2]?.token;
assert.equal(first.length, 3);
assert.equal(first[2]?.hook, 'useState');
assert.throws(() => runtime.render(input.second), /HOOK_ORDER_CHANGED/);
assert.equal(runtime.slots(), first);

const stable = createRuntime('ProfileFixed');
const stableFirst = stable.render(input.fixed);
const stableSecond = stable.render(input.fixed);
assert.equal(stableFirst[2]?.token, stableSecond[2]?.token);
assert.notEqual(stableFirst[0]?.token, stableFirst[1]?.token);

assert.ok(valueBeforeError);
console.log(JSON.stringify({
  first: input.first,
  errorKeptPreviousSlots: runtime.slots() === first,
  stableTokensEqual: stableFirst[2]?.token === stableSecond[2]?.token,
}));
console.log('Hook 顺序与槽位身份通过');
`,
      checkpoint:
        '第一次渲染三个槽位，第二次少一个 useEffect 时抛 HOOK_ORDER_CHANGED 且失败渲染不覆盖旧槽位；稳定两次渲染中同位置第三个 useState 保持相同 token；最后出现“Hook 顺序与槽位身份通过”且退出码为 0。',
    }),
    frontendTask({
      id: 'frontend-p04-hooks-order-independent',
      title: '独立实践：Effect 依赖、清理与请求竞态',
      brief:
        'stdin 给两个资源 id。模拟一个请求 Effect：id 变化先运行旧 cleanup，再启动新请求；旧请求晚到不能覆盖新状态，最终卸载会清空订阅和定时器。',
      stdin: '{"first":"order-a","second":"order-b","resourceCount":3}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly first: string; readonly second: string; readonly resourceCount: number };
type Deferred = { readonly promise: Promise<string>; readonly resolve: (value: string) => void };

function deferred(): Deferred {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Effect = {
  readonly key: string;
  readonly cleanup: () => void;
};

function createEffectRunner() {
  let active: Effect | undefined;
  let visible = '';
  let cleanups = 0;
  const resources = new Set<string>();
  return {
    async run(key: string, request: Promise<string>): Promise<void> {
      active?.cleanup();
      let cancelled = false;
      resources.add(key);
      const cleanup = () => {
        if (cancelled) return;
        cancelled = true;
        resources.delete(key);
        cleanups += 1;
      };
      active = { key, cleanup };
      const value = await request;
      if (!cancelled) visible = key + ':' + value;
    },
    unmount(): void {
      active?.cleanup();
      active = undefined;
    },
    visible: () => visible,
    cleanups: () => cleanups,
    resources: () => resources.size,
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
if (input.resourceCount < 1) throw new Error('RESOURCE_COUNT');
const runner = createEffectRunner();
const first = deferred();
const second = deferred();

const firstRun = runner.run(input.first, first.promise);
const secondRun = runner.run(input.second, second.promise);
second.resolve('fresh');
await secondRun;
first.resolve('stale');
await firstRun;

assert.equal(runner.visible(), 'order-b:fresh');
assert.equal(runner.cleanups(), 1);
assert.equal(runner.resources(), 1);
runner.unmount();
assert.equal(runner.cleanups(), 2);
assert.equal(runner.resources(), 0);

console.log(JSON.stringify({ visible: runner.visible(), cleanups: runner.cleanups(), resources: runner.resources() }));
console.log('Effect 清理与竞态隔离通过');
`,
      checkpoint:
        '第二个请求先完成后 visible 为 order-b:fresh，第一个 old 请求晚到不能覆盖；切换时 cleanup 数为 1，卸载后为 2，资源集合为 0；最后出现“Effect 清理与竞态隔离通过”且退出码为 0。',
    }),
  ),

  'programming:React Router、数据缓存与 Next.js 部署': frontendLab(
    'P04 代码台 03 · 服务端边界、查询缓存与路由恢复',
    '在不加载框架的 TypeScript 中模拟服务端数据白名单、查询键、并发去重、过期和精确失效，并验证 URL 是筛选与分页的可恢复来源。',
    frontendTask({
      id: 'frontend-p04-next-boundary-guided',
      title: '跟做：服务端秘密不进入客户端载荷',
      brief:
        'stdin 提供订单详情、数据库连接串和当前用户。服务端筛选公开字段后再传给客户端；权限不足时不返回任何订单字段，只返回稳定错误。',
      stdin: '{"order":{"id":"O-9","totalCents":8800,"status":"paid","internalNote":"vip","dbUrl":"postgres://secret"},"role":"support"}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = {
  readonly order: {
    readonly id: string;
    readonly totalCents: number;
    readonly status: string;
    readonly internalNote: string;
    readonly dbUrl: string;
  };
  readonly role: 'support' | 'viewer';
};
type PublicOrder = {
  readonly id: string;
  readonly totalCents: number;
  readonly status: string;
};
type Response =
  | { readonly ok: true; readonly order: PublicOrder; readonly cache: string }
  | { readonly ok: false; readonly code: 'FORBIDDEN' };

function serverPayload(input: Input): Response {
  if (input.role !== 'support') return { ok: false, code: 'FORBIDDEN' };
  const order: PublicOrder = {
    id: input.order.id,
    totalCents: input.order.totalCents,
    status: input.order.status,
  };
  return {
    ok: true,
    order: Object.freeze(order),
    cache: 'private, max-age=15, stale-while-revalidate=30',
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const response = serverPayload(input);
assert.deepEqual(response, {
  ok: true,
  order: { id: 'O-9', totalCents: 8800, status: 'paid' },
  cache: 'private, max-age=15, stale-while-revalidate=30',
});
const serialized = JSON.stringify(response);
assert.equal(serialized.includes('postgres://secret'), false);
assert.equal(serialized.includes('internalNote'), false);
assert.deepEqual(serverPayload({ ...input, role: 'viewer' }), { ok: false, code: 'FORBIDDEN' });

console.log(serialized);
console.log('服务端字段白名单与权限边界通过');
`,
      checkpoint:
        '成功响应只含 id、totalCents、status 和缓存策略，不含 dbUrl 或 internalNote；viewer 得到 FORBIDDEN；最后出现“服务端字段白名单与权限边界通过”且退出码为 0。把整个 order 直接传给客户端时，秘密字段断言必须失败。',
    }),
    frontendTask({
      id: 'frontend-p04-next-boundary-independent',
      title: '独立实践：查询缓存去重、失效与 URL 恢复',
      brief:
        'stdin 包含 URL 查询词、分页和多条缓存事件。规范化页码和查询词，合并并发请求，按 staleTime 判断命中，写操作后只失效指定键，最后验证 URL 与缓存键一致。',
      stdin: '{"url":"/orders?q=O-2&page=2","now":1000,"events":[{"key":"order:O-2","start":1000,"finish":1030},{"key":"order:O-2","start":1010,"finish":1040},{"key":"orders:O-2:2","start":1200,"finish":1210}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Event = { readonly key: string; readonly start: number; readonly finish: number };
type Input = { readonly url: string; readonly now: number; readonly events: readonly Event[] };
type Entry = { readonly value: string; readonly updatedAt: number; readonly inflight?: Promise<string> };

function normalizeUrl(url: string): { readonly query: string; readonly page: number; readonly key: string } {
  if (!url.startsWith('/orders')) throw new Error('ROUTE');
  const question = url.indexOf('?');
  const params = new URLSearchParams(question >= 0 ? url.slice(question + 1) : '');
  const query = (params.get('q') ?? '').trim().slice(0, 40);
  const page = Math.max(1, Math.min(100, Number(params.get('page') ?? 1) || 1));
  return { query, page, key: 'orders:' + (query || '*') + ':' + page };
}

function createCache(staleMs: number) {
  const entries = new Map<string, Entry>();
  let starts = 0;
  return {
    starts: () => starts,
    load(key: string, now: number, fetcher: () => Promise<string>): Promise<string> {
      const existing = entries.get(key);
      if (existing?.inflight) return existing.inflight;
      if (existing && now - existing.updatedAt <= staleMs) return Promise.resolve(existing.value);
      starts += 1;
      const inflight = fetcher().then((value) => {
        entries.set(key, { value, updatedAt: now });
        return value;
      });
      entries.set(key, { value: existing?.value ?? '', updatedAt: existing?.updatedAt ?? -Infinity, inflight });
      return inflight;
    },
    invalidate(key: string): void {
      entries.delete(key);
    },
    has: (key: string) => entries.has(key),
  };
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const normalized = normalizeUrl(input.url);
assert.deepEqual(normalized, { query: 'O-2', page: 2, key: 'orders:O-2:2' });
const cache = createCache(500);
let calls = 0;
const fetcher = async (): Promise<string> => {
  calls += 1;
  await Promise.resolve();
  return 'rows:' + normalized.key;
};
const first = cache.load(normalized.key, input.now, fetcher);
const second = cache.load(normalized.key, input.now + 10, fetcher);
assert.equal(first, second);
assert.equal(await first, 'rows:orders:O-2:2');
assert.equal(calls, 1);
assert.equal(cache.starts(), 1);
assert.equal(await cache.load(normalized.key, input.now + 100, fetcher), 'rows:orders:O-2:2');
assert.equal(calls, 1);
cache.invalidate(normalized.key);
assert.equal(cache.has(normalized.key), false);
await cache.load(normalized.key, input.now + 600, fetcher);
assert.equal(calls, 2);

console.log(JSON.stringify({
  normalized,
  calls,
  eventKeys: input.events.map((event) => event.key),
  durations: input.events.map((event) => event.finish - event.start),
}));
console.log('查询去重、失效与 URL 恢复通过');
`,
      checkpoint:
        'URL 规范化为 q=O-2、page=2、key=orders:O-2:2；两个并发 load 返回同一 Promise 且 fetcher 只调用一次；stale 时间内命中缓存；invalidate 后重新请求使 calls 为 2；最后出现“查询去重、失效与 URL 恢复通过”且退出码为 0。',
    }),
  ),

  'programming:React 源码：Fiber、Hooks 与 Scheduler': frontendLab(
    'P04 代码台 04 · 可中断工作循环与优先级调度',
    '用普通对象模拟 Fiber 工作单元、Scheduler 优先级队列和时间片让出；验证 render 工作可中断，而 commit 必须原子完成。',
    frontendTask({
      id: 'frontend-p04-fiber-guided',
      title: '跟做：时间片内构建与一次性提交',
      brief:
        'stdin 提供组件工作单元数、每个单元耗时和单个时间片预算。循环逐个完成 work unit，预算耗尽时让出；所有单元完成后才能进入 commit，提交一步不能中断。',
      stdin: '{"units":7,"costPerUnit":6,"frameBudget":20}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Input = { readonly units: number; readonly costPerUnit: number; readonly frameBudget: number };
type WorkUnit = { readonly id: string; readonly phase: 'begin' | 'complete'; readonly cost: number };
type RenderSlice = { readonly completed: readonly string[]; readonly yielded: boolean; readonly used: number };

function buildUnits(count: number, cost: number): readonly WorkUnit[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('UNITS');
  if (!Number.isInteger(cost) || cost < 1) throw new Error('COST');
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    id: 'fiber-' + (index + 1),
    phase: index % 2 === 0 ? 'begin' : 'complete',
    cost,
  } as const)));
}

function render(units: readonly WorkUnit[], budget: number): readonly RenderSlice[] {
  if (!Number.isInteger(budget) || budget < 1) throw new Error('BUDGET');
  const slices: RenderSlice[] = [];
  let cursor = 0;
  while (cursor < units.length) {
    let used = 0;
    const completed: string[] = [];
    while (cursor < units.length) {
      const unit = units[cursor];
      if (!unit) throw new Error('UNIT_MISSING');
      if (completed.length > 0 && used + unit.cost > budget) break;
      completed.push(unit.id);
      used += unit.cost;
      cursor += 1;
    }
    slices.push(Object.freeze({ completed: Object.freeze(completed), yielded: cursor < units.length, used }));
  }
  return Object.freeze(slices);
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const units = buildUnits(input.units, input.costPerUnit);
const slices = render(units, input.frameBudget);
assert.equal(slices.length > 1, true);
assert.equal(slices.at(-1)?.yielded, false);
assert.equal(slices.slice(0, -1).every((slice) => slice.yielded), true);
assert.equal(slices.flatMap((slice) => slice.completed).length, input.units);
assert.equal(new Set(slices.flatMap((slice) => slice.completed)).size, input.units);

const commit = (): readonly string[] => {
  const mutations = ['update:fiber-1', 'layout:fiber-1'];
  const layout = ['attach:fiber-2'];
  if (mutations.length === 0 || layout.length === 0) throw new Error('PARTIAL_COMMIT');
  return Object.freeze([...mutations, ...layout]);
};
const committed = commit();
assert.deepEqual(committed, ['update:fiber-1', 'layout:fiber-1', 'attach:fiber-2']);

console.log(JSON.stringify({ slices, committed }));
console.log('可中断渲染与原子提交通过');
`,
      checkpoint:
        '7 个 unit 在 budget=20 下至少被切成两片，最后一片 yielded=false，前面各片 yielded=true；每个 fiber id 恰好完成一次；commit 同时包含 mutation、layout 和 attach 三步；最后出现“可中断渲染与原子提交通过”且退出码为 0。',
    }),
    frontendTask({
      id: 'frontend-p04-scheduler-independent',
      title: '独立实践：优先级队列与饥饿保护',
      brief:
        'stdin 给多个不同优先级的任务。实现小顶堆调度器，高优先级先执行；低优先级每等待三轮提升一级，避免持续高优先级任务造成饥饿，并记录每次出队原因。',
      stdin: '{"tasks":[{"id":"low","priority":1,"arrival":0},{"id":"normal-1","priority":2,"arrival":0},{"id":"urgent","priority":4,"arrival":0},{"id":"normal-2","priority":2,"arrival":2},{"id":"low-2","priority":1,"arrival":3}]}',
      code: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Task = { readonly id: string; readonly priority: number; readonly arrival: number };
type Input = { readonly tasks: readonly Task[] };
type QueueItem = Task & { readonly waitedRounds: number; readonly effectivePriority: number; readonly aged: boolean };

function compare(left: QueueItem, right: QueueItem): number {
  if (left.effectivePriority !== right.effectivePriority) {
    return right.effectivePriority - left.effectivePriority;
  }
  if (left.arrival !== right.arrival) return left.arrival - right.arrival;
  return left.id.localeCompare(right.id);
}

class Scheduler {
  #queue: QueueItem[] = [];

  push(item: QueueItem): void {
    this.#queue.push(item);
    this.#queue.sort(compare);
  }

  pop(round: number): QueueItem {
    if (this.#queue.length === 0) throw new Error('QUEUE_EMPTY');
    this.#queue = this.#queue.map((item) => {
      const waitedRounds = round - item.arrival;
      const shouldAge = item.priority <= 2 && waitedRounds >= 3 && !item.aged;
      return Object.freeze({
        ...item,
        waitedRounds,
        effectivePriority: item.effectivePriority + (shouldAge ? 1 : 0),
        aged: item.aged || shouldAge,
      });
    }).sort(compare);
    const next = this.#queue.shift();
    if (!next) throw new Error('QUEUE_EMPTY');
    return next;
  }

  size(): number {
    return this.#queue.length;
  }
}

const input = JSON.parse(readFileSync(0, 'utf8')) as Input;
const scheduler = new Scheduler();
const ordered: string[] = [];
for (let round = 0; round < 8 && (input.tasks.some((task) => task.arrival <= round) || scheduler.size() > 0); round += 1) {
  for (const task of input.tasks) {
    if (task.arrival === round) {
      if (!Number.isInteger(task.priority) || task.priority < 1 || task.priority > 5) {
        throw new Error('PRIORITY');
      }
      scheduler.push(Object.freeze({
        ...task,
        waitedRounds: 0,
        effectivePriority: task.priority,
        aged: false,
      }));
    }
  }
  if (scheduler.size() > 0) ordered.push(scheduler.pop(round).id);
}

assert.equal(ordered[0], 'urgent');
assert.equal(ordered.includes('low-2'), true);
assert.equal(new Set(ordered).size, ordered.length);
assert.equal(scheduler.size(), 0);

console.log(JSON.stringify({ ordered }));
console.log('优先级调度与饥饿保护通过');
`,
      checkpoint:
        'urgent 必须先出队；所有输入任务最终都进入 ordered 且无重复；普通与低优先级在等待三轮后提升，low-2 不会被永久压住；队列最终为 0；最后出现“优先级调度与饥饿保护通过”且退出码为 0。',
    }),
  ),
};
