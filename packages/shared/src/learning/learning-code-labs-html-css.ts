import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

const BROWSER_SANDBOX = {
  runtimeLabel: 'HTML / CSS 浏览器沙箱',
  installSteps: [
    '代码在隔离的无脚本 iframe 中渲染，不执行 JavaScript，也不访问父页面 DOM。',
    'CSS 必须内嵌在当前 HTML 单文件中；图片只可使用内嵌 data URL，禁止外链、字体和媒体请求。',
    '调整浏览器宽度或使用打印预览观察结果；checkpoint 中的结构、计算样式和可见状态都应能被人工核对。',
  ],
  languages: ['html'],
} as const satisfies Pick<
  LearningV2CodeLab,
  'runtimeLabel' | 'installSteps' | 'languages'
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
    ...BROWSER_SANDBOX,
    practice,
    apply,
  };
}

export const LEARNING_CODE_LABS_HTML_CSS: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:HTML5 · 浏览器、文档与开发工具：DOCTYPE、head、body 与文档树': browserLab(
    '文档骨架与资源顺序',
    '从 doctype、语言、字符集、标题和视口开始建立可解析、可检查的 HTML 文档，并用无语义容器与语义节点对照文档树。',
    browserTask(
      'html-css-doctype-practice',
      '建立可验证的标准文档',
      '补全 doctype、html lang、charset、viewport 与 title，让正文包含一个站点标题和一段说明。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>课程资料库</title>
    <style>
      :root { color-scheme: light; font-family: "Microsoft YaHei", sans-serif; }
      body { margin: 0; background: #f4f7fb; color: #172033; }
      header { padding: 2rem clamp(1rem, 5vw, 4rem); background: #12355b; color: white; }
      main { max-width: 70rem; margin: 0 auto; padding: 2rem 1rem; }
      .notice { border-left: 0.35rem solid #e09f3e; padding: 1rem; background: white; }
    </style>
  </head>
  <body>
    <header>
      <p>工程技术学习中心</p>
      <h1>课程资料库</h1>
    </header>
    <main>
      <p class="notice">先确认文档语言、字符集和标题，再添加业务内容。</p>
    </main>
  </body>
</html>`,
      '文档以 `<!doctype html>` 开始；head 中 charset 位于前 1024 字节内；浏览器标签标题为“课程资料库”；DOM 只有一个 html、head 和 body。',
    ),
    browserTask(
      'html-css-doctype-apply',
      '分析并修正文档树',
      '保留正确的文档外壳，为“设备维护手册”建立带页头、目录和正文的层级，同时避免跳过标题级别。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="设备维护手册的章节结构与检查步骤">
    <title>设备维护手册</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font: 16px/1.7 system-ui, sans-serif; color: #263238; background: #eef2f1; }
      .shell { display: grid; grid-template-columns: minmax(12rem, 16rem) 1fr; min-height: 100vh; }
      header { grid-column: 1 / -1; padding: 1.5rem 2rem; background: #1f4d46; color: #f7fffd; }
      nav { padding: 2rem; border-right: 1px solid #b7c9c5; background: #f8fbfa; }
      main { padding: 2rem clamp(1rem, 5vw, 4rem); background: white; }
      h1, h2, h3 { line-height: 1.25; }
      code { padding: .15rem .35rem; border-radius: .25rem; background: #e5eeec; }
      @media (max-width: 44rem) {
        .shell { grid-template-columns: 1fr; }
        nav { border-right: 0; border-bottom: 1px solid #b7c9c5; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <p>运维知识库</p>
        <h1>设备维护手册</h1>
      </header>
      <nav aria-label="章节目录">
        <h2>目录</h2>
        <ol>
          <li><a href="#inspect">巡检</a></li>
          <li><a href="#replace">更换耗材</a></li>
        </ol>
      </nav>
      <main>
        <section id="inspect">
          <h2>巡检</h2>
          <p>记录温度、噪声和指示灯状态。</p>
          <h3>安全条件</h3>
          <p>断电并等待设备冷却后再开盖。</p>
        </section>
        <section id="replace">
          <h2>更换耗材</h2>
          <p>使用规格一致的部件，完成后执行 <code>自检</code>。</p>
        </section>
      </main>
    </div>
  </body>
</html>`,
      '标题层级依次为 h1、h2、h3；导航有可访问名称；Elements 面板可见 header、nav、main 与 section 的同级/嵌套边界；320px 宽度无横向溢出。',
    ),
  ),

  'programming:HTML5 · 浏览器、文档与开发工具：标题层级、段落、链接与图片': browserLab(
    '内容层级与替代内容',
    '用标题、段落、列表、链接和内嵌图像表达可扫描的文章，并让链接文本与图片替代文本脱离视觉上下文仍有意义。',
    browserTask(
      'html-css-content-practice',
      '整理文章内容层级',
      '把零散文字组织为一篇“城市骑行指南”，包含一个 h1、两个 h2、段落、有序步骤和一个页面内链接。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>城市骑行指南</title>
    <style>
      body { margin: 0; font: 17px/1.75 Georgia, "Noto Serif SC", serif; color: #25221e; background: #f8f4eb; }
      article { width: min(48rem, calc(100% - 2rem)); margin: 3rem auto; }
      h1 { font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; margin-bottom: 1rem; }
      h2 { margin-top: 2.5rem; border-bottom: 2px solid #bd5b32; }
      .lede { font-size: 1.15rem; color: #5c5045; }
      nav a { color: #8c3519; }
      ol { padding-left: 1.4rem; }
      li + li { margin-top: .6rem; }
    </style>
  </head>
  <body>
    <article id="top">
      <p>出行手册 · 第 3 篇</p>
      <h1>城市骑行指南</h1>
      <p class="lede">用一条熟悉路线练习判断、沟通和车辆检查。</p>
      <nav aria-label="文章目录">
        <a href="#steps">直接查看出发步骤</a>
      </nav>
      <section>
        <h2>先选路线</h2>
        <p>优先选择有连续非机动车道、照明和补给点的道路。</p>
      </section>
      <section id="steps">
        <h2>出发前检查</h2>
        <ol>
          <li>确认轮胎气压和刹车手感。</li>
          <li>检查车灯，并把证件放入固定口袋。</li>
          <li>告诉同行者预计到达时间。</li>
        </ol>
      </section>
    </article>
  </body>
</html>`,
      '页面只有一个 h1；两个 h2 分别对应“先选路线”和“出发前检查”；目录链接能把视口滚到步骤区域；正文宽度在 320px 窗口仍可读。',
    ),
    browserTask(
      'html-css-content-apply',
      '编写可理解的新闻摘要',
      '完成一篇“社区花园开放日”的图文摘要。图片使用内嵌 data URL，链接文本必须说明去向，图注与正文不能重复。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>社区花园开放日</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #edf4e8; color: #1d2a20; font: 16px/1.7 system-ui, sans-serif; }
      main { width: min(72rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      .story { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 1fr); gap: 2rem; align-items: start; }
      h1 { margin: 0 0 .5rem; font-size: clamp(2rem, 6vw, 4.5rem); line-height: 1; color: #28543b; }
      h2 { margin-top: 2rem; }
      figure { margin: 0; border: .6rem solid white; background: #d5e6cc; box-shadow: 0 1rem 2rem #29433022; }
      img { display: block; width: 100%; height: auto; }
      figcaption { padding: .8rem 1rem; font-size: .9rem; }
      a { color: #075f65; text-underline-offset: .2em; }
      a:focus-visible { outline: 3px solid #d46a1f; outline-offset: 3px; }
      @media (max-width: 48rem) { .story { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <div class="story">
        <article>
          <p>社区记录 · 11 月 24 日</p>
          <h1>社区花园开放日</h1>
          <p>居民将在周六共同完成冬季堆肥、香草移栽和儿童自然观察。</p>
          <h2>现场安排</h2>
          <p>上午进行种植示范，下午由志愿者带领辨认本地植物。</p>
          <p><a href="#contact">查看报名与到场说明</a></p>
          <h2 id="contact">到场说明</h2>
          <p>请穿耐脏鞋，自带水杯；工具由花园统一提供。</p>
        </article>
        <figure>
          <img
            width="1200"
            height="900"
            alt="三块抬高的木制种植床围着一间绿色工具房"
            src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjkwMCIgdmlld0JveD0iMCAwIDEyMDAgOTAwIj48cmVjdCB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI5MDAiIGZpbGw9IiNkOGU2Y2QiLz48cmVjdCB4PSI4MDAiIHk9IjE2MCIgd2lkdGg9IjI2MCIgaGVpZ2h0PSIyNDAiIGZpbGw9IiMyODU0M2IiLz48cGF0aCBkPSJNMTYwIDYyMGg4MDB2MTEwSDE2MHoiIGZpbGw9IiM4YzVhMzUiLz48cGF0aCBkPSJNMTYwIDU2MGg4MDB2NjBIMTYweiIgZmlsbD0iIzQ3N2E0NyIvPjxjaXJjbGUgY3g9IjI0MCIgY3k9IjUyMCIgcj0iNDgiIGZpbGw9IiNlMDlmM2UiLz48Y2lyY2xlIGN4PSI1MjAiIGN5PSI1MDAiIHI9IjU4IiBmaWxsPSIjZjk1Ii8+PC9zdmc+">
          <figcaption>社区志愿者搭建的抬高种植床，雨后仍保留排水通道。</figcaption>
        </figure>
      </div>
    </main>
  </body>
</html>`,
      '图片无需网络即可显示；alt 描述画面而非文件名；图注补充背景；链接能把视口送到到场说明；320px 下单列布局且图片保持比例。',
    ),
  ),

  'programming:HTML5 · 语义、结构与企业页面骨架：header、nav、main 与 footer': browserLab(
    '页面地标与导航',
    '建立唯一主内容地标和可区分导航，让键盘与辅助技术可以直接定位页面区域。',
    browserTask(
      'html-css-landmark-practice',
      '搭出企业页四大地标',
      '为企业服务页建立 header、主导航、唯一 main 和 footer；导航使用列表和 aria-current。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>澄明环境工程</title>
    <style>
      :root { --ink: #152b2e; --brand: #0b6b66; --paper: #f7fbfa; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.6 system-ui, sans-serif; }
      a { color: inherit; }
      .site-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.2rem clamp(1rem, 5vw, 4rem); background: white; border-bottom: 1px solid #b9d3cf; }
      .brand { margin: 0; color: var(--brand); }
      nav ul { display: flex; flex-wrap: wrap; gap: .8rem 1.2rem; margin: 0; padding: 0; list-style: none; }
      nav a { display: inline-block; padding: .5rem .2rem; text-decoration-thickness: .12em; text-underline-offset: .22em; }
      nav a[aria-current="page"] { color: var(--brand); font-weight: 800; border-bottom: .2rem solid #e09f3e; }
      main { min-height: 55vh; padding: clamp(2rem, 8vw, 6rem) clamp(1rem, 5vw, 4rem); }
      .intro { max-width: 48rem; }
      h1 { font-size: clamp(2.2rem, 7vw, 5rem); line-height: 1; margin: 0 0 1rem; }
      .site-footer { padding: 2rem; color: #d8eeee; background: #15383a; }
      a:focus-visible { outline: 3px solid #e09f3e; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <header class="site-header">
      <p class="brand">澄明环境工程</p>
      <nav aria-label="主导航">
        <ul>
          <li><a href="#services" aria-current="page">服务</a></li>
          <li><a href="#projects">项目</a></li>
          <li><a href="#contact">联系</a></li>
        </ul>
      </nav>
    </header>
    <main id="services">
      <div class="intro">
        <p>工业水处理 · 能耗诊断</p>
        <h1>让每一条管线都有可追踪的改进记录。</h1>
        <p>从现场测量、方案设计到运行复盘，团队用同一套数据口径处理问题。</p>
      </div>
    </main>
    <footer class="site-footer">
      <p>澄明环境工程 · 工作日 09:00–17:30</p>
    </footer>
  </body>
</html>`,
      'DOM 中只有一个 main 和一个已命名 nav；主导航当前项带 aria-current=page；只用 Tab 可依次到达三个链接并看见焦点环。',
    ),
    browserTask(
      'html-css-landmark-apply',
      '区分站点与文章地标',
      '为知识库文章页建立站点页头、面包屑、文章 header、正文 main 和站点 footer，并给两个导航不同名称。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>如何安排数据库维护窗口 · 运维知识库</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f2f4f7; color: #1c2733; font: 16px/1.75 system-ui, sans-serif; }
      .top { padding: 1rem 1.5rem; background: #243b53; color: white; }
      .top a { color: white; }
      .crumbs { padding: .8rem clamp(1rem, 5vw, 4rem); background: #e1e8f0; }
      .crumbs ol { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0; padding: 0; list-style: none; }
      .crumbs li + li::before { content: "/"; padding-right: .4rem; color: #66788a; }
      main { max-width: 54rem; margin: 2rem auto; padding: 0 1rem; }
      article { padding: clamp(1.2rem, 5vw, 3rem); background: white; border-top: .35rem solid #1f8a70; box-shadow: 0 .8rem 2rem #1c273314; }
      article header { border-bottom: 1px solid #d7dee6; margin-bottom: 1.5rem; }
      h1 { line-height: 1.18; }
      .meta { color: #5c6b7a; }
      footer { padding: 2rem; text-align: center; background: #dce4eb; }
      a:focus-visible { outline: 3px solid #c05621; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <header class="top">
      <a href="#main">运维知识库</a>
    </header>
    <nav class="crumbs" aria-label="面包屑">
      <ol>
        <li><a href="#main">知识库</a></li>
        <li><a href="#main">数据库</a></li>
        <li aria-current="page">维护窗口</li>
      </ol>
    </nav>
    <main id="main">
      <article>
        <header>
          <p>数据库运行手册</p>
          <h1>如何安排数据库维护窗口</h1>
          <p class="meta">更新于 2026-11-24 · 预计阅读 6 分钟</p>
        </header>
        <p>维护窗口不是开始执行命令的时间，而是从通知、冻结写入、备份校验到恢复验收的完整时段。</p>
        <h2>窗口前检查</h2>
        <ul>
          <li>确认业务方知晓不可用时间。</li>
          <li>确认最近备份可以在隔离环境恢复。</li>
          <li>准备回滚条件与停止执行阈值。</li>
        </ul>
      </article>
    </main>
    <footer>
      <p>内部资料 · 变更需经值班负责人批准</p>
    </footer>
  </body>
</html>`,
      '两个 nav 分别可读为“主导航”和“面包屑”；article header 位于 main 内，站点 header/footer 位于 main 外；跳转链接与 Tab 均能到达主内容。',
    ),
  ),

  'programming:HTML5 · 语义、结构与企业页面骨架：article、section 与 aside 的边界': browserLab(
    '分节内容与旁注',
    '根据内容能否独立分发选择 article、section 与 aside，避免用 div 堆叠出没有语义边界的页面。',
    browserTask(
      'html-css-section-practice',
      '拆分公告、流程与旁注',
      '把内容整理为可独立阅读的维护公告 article、两个有标题的 section，以及不参与主线的 aside。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>周末网络维护公告</title>
    <style>
      body { margin: 0; background: #f0f3f8; color: #1f2937; font: 16px/1.7 system-ui, sans-serif; }
      .layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(15rem, 1fr); gap: 1.5rem; max-width: 70rem; margin: 2rem auto; padding: 1rem; }
      article, aside { background: white; padding: 1.5rem; border-radius: .5rem; }
      article { border-top: .35rem solid #2563a8; }
      aside { align-self: start; border-left: .35rem solid #d08a23; background: #fffaf0; }
      section + section { margin-top: 2rem; }
      h1, h2 { line-height: 1.25; }
      @media (max-width: 46rem) { .layout { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="layout">
      <article>
        <header>
          <p>基础设施通知</p>
          <h1>周末网络维护公告</h1>
        </header>
        <section>
          <h2>影响范围</h2>
          <p>周六 02:00–04:00，办公网到测试环境的专线可能中断。</p>
        </section>
        <section>
          <h2>你需要做什么</h2>
          <p>提前保存工作，避免在该时段发布配置。</p>
        </section>
      </article>
      <aside aria-labelledby="aside-title">
        <h2 id="aside-title">值班说明</h2>
        <p>网络组每 30 分钟更新一次状态，紧急问题从服务台升级。</p>
      </aside>
    </main>
  </body>
</html>`,
      'article 在移除站点外壳后仍可独立理解；两个 section 都有 h2；aside 有 aria-labelledby 且视觉上位于主线旁；窄屏后阅读顺序仍先公告后值班说明。',
    ),
    browserTask(
      'html-css-section-apply',
      '组织产品更新日志',
      '创建四篇可独立分发的更新 article，每篇包含版本、日期、标题、变更列表；侧栏集中放兼容性提醒。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>协作平台更新日志</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #171b22; color: #e8edf2; font: 16px/1.65 system-ui, sans-serif; }
      .page { display: grid; grid-template-columns: minmax(0, 3fr) minmax(15rem, 1fr); gap: 2rem; width: min(74rem, 100%); margin: auto; padding: 2rem 1rem; }
      .release-list { display: grid; gap: 1rem; }
      article { padding: 1.25rem 1.5rem; background: #242c36; border: 1px solid #3d4b59; border-radius: .4rem; }
      article header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .5rem; }
      article h2 { margin: 0; color: #8bd3c7; }
      time { color: #b8c4d0; }
      aside { padding: 1rem; border-left: .3rem solid #e7a844; background: #30291f; align-self: start; }
      code { color: #ffe1a6; }
      @media (max-width: 48rem) { .page { grid-template-columns: 1fr; } aside { order: -1; } }
    </style>
  </head>
  <body>
    <main class="page">
      <section aria-labelledby="release-title">
        <h1 id="release-title">协作平台更新日志</h1>
        <div class="release-list">
          <article>
            <header><h2>v4.8</h2><time datetime="2026-11-24">2026-11-24</time></header>
            <ul><li>任务详情支持离线草稿。</li><li>修复导出文件重名。</li></ul>
          </article>
          <article>
            <header><h2>v4.7</h2><time datetime="2026-11-17">2026-11-17</time></header>
            <ul><li>新增批量调整截止日期。</li><li>改善键盘菜单定位。</li></ul>
          </article>
        </div>
      </section>
      <aside aria-labelledby="compat-title">
        <h2 id="compat-title">兼容性提醒</h2>
        <p>v4.8 起导出接口使用 <code>schemaVersion: 3</code>，旧脚本需先升级。</p>
      </aside>
    </main>
  </body>
</html>`,
      '每篇日志都有独立 h2 和时间；aside 只放跨版本提醒；窄屏时警告先出现但 DOM 仍保留新闻后旁注的可解释顺序。',
    ),
  ),

  'programming:HTML5 · 表单、输入与验证：form、label 与输入控件关联': browserLab(
    '原生表单语义',
    '为每个控件建立稳定标签、名称、帮助文本与原生校验状态，并验证不使用鼠标也能完成提交。',
    browserTask(
      'html-css-form-basic',
      '建立可访问预约表单',
      '创建姓名、工作邮箱和到访日期三个字段；每项都有可见 label，邮箱字段带格式帮助。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>访客预约</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: #e8efe8; color: #193124; font: 16px/1.6 system-ui, sans-serif; }
      form { width: min(34rem, 100%); padding: clamp(1.2rem, 5vw, 2.5rem); background: #fffdf7; border: 1px solid #b9cbbd; border-radius: .5rem; box-shadow: 0 1rem 3rem #17331f1a; }
      h1 { margin-top: 0; }
      .field { display: grid; gap: .4rem; margin-bottom: 1.1rem; }
      label { font-weight: 750; }
      input { min-height: 2.75rem; padding: .55rem .7rem; border: 2px solid #6b7f70; border-radius: .3rem; font: inherit; background: white; }
      input:focus-visible, button:focus-visible { outline: 3px solid #c25f23; outline-offset: 2px; }
      .help { color: #4c6254; font-size: .9rem; }
      button { min-height: 2.75rem; padding: .55rem 1.1rem; border: 0; border-radius: .3rem; background: #235c38; color: white; font: inherit; font-weight: 750; cursor: pointer; }
    </style>
  </head>
  <body>
    <form action="#confirmation">
      <h1>访客预约</h1>
      <p>提交后请在前台出示确认信息。</p>
      <div class="field">
        <label for="visitor-name">姓名</label>
        <input id="visitor-name" name="name" autocomplete="name" required>
      </div>
      <div class="field">
        <label for="visitor-email">工作邮箱</label>
        <input id="visitor-email" name="email" type="email" autocomplete="email" aria-describedby="email-help" required>
        <span id="email-help" class="help">用于接收门禁二维码，例如 name@example.cn。</span>
      </div>
      <div class="field">
        <label for="visit-date">到访日期</label>
        <input id="visit-date" name="date" type="date" required>
      </div>
      <button type="submit">确认预约</button>
    </form>
    <p id="confirmation">预约表单已通过浏览器校验。</p>
  </body>
</html>`,
      '点击每个 label 都会聚焦对应控件；Accessibility 面板显示控件名称和帮助描述；空表单提交会被原生必填校验阻止；Tab 顺序与视觉顺序一致。',
    ),
    browserTask(
      'html-css-form-apply',
      '完成无障碍活动报名',
      '为活动报名建立分组单选、饮食备注、条款确认和提交区。使用 fieldset/legend、显式标签与清晰按钮类型。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>无障碍设计工作坊报名</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f2f8; color: #2d2335; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(44rem, 100%); margin: 2rem auto; padding: 1rem; }
      form { padding: clamp(1.2rem, 5vw, 2.5rem); background: white; border-top: .4rem solid #74519b; }
      h1 { line-height: 1.2; margin-top: 0; }
      fieldset { margin: 1.4rem 0; padding: 1rem; border: 1px solid #ad9bbd; border-radius: .35rem; }
      legend { padding: 0 .4rem; font-weight: 800; }
      .choice { display: flex; gap: .7rem; align-items: flex-start; min-height: 2.75rem; padding: .45rem 0; }
      .choice input { width: 1.25rem; height: 1.25rem; margin-top: .15rem; accent-color: #74519b; }
      .field { display: grid; gap: .4rem; margin: 1rem 0; }
      label:not(.choice) { font-weight: 750; }
      input, textarea { min-height: 2.75rem; padding: .6rem; border: 2px solid #8d789f; border-radius: .3rem; font: inherit; }
      textarea { min-height: 7rem; resize: vertical; }
      .actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.2rem; }
      button { min-height: 2.75rem; padding: .6rem 1.1rem; border: 2px solid #5f3c84; border-radius: .3rem; font: inherit; font-weight: 750; cursor: pointer; }
      button[type="submit"] { color: white; background: #5f3c84; }
      button[type="reset"] { color: #4b315f; background: white; }
      :focus-visible { outline: 3px solid #c96f11; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <form action="#done">
        <h1>无障碍设计工作坊报名</h1>
        <p>11 月 28 日 14:00 · 市图书馆三层培训室</p>
        <fieldset>
          <legend>参与形式</legend>
          <label class="choice"><input type="radio" name="format" value="onsite" checked> 现场参与</label>
          <label class="choice"><input type="radio" name="format" value="online"> 在线参与</label>
        </fieldset>
        <fieldset>
          <legend>联系与需求</legend>
          <div class="field">
            <label for="attendee-name">报名姓名</label>
            <input id="attendee-name" name="name" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="access-note">无障碍或饮食需求（选填）</label>
            <textarea id="access-note" name="note" aria-describedby="note-help"></textarea>
            <span id="note-help">例如字幕、轮椅席位或过敏信息。</span>
          </div>
          <label class="choice"><input type="checkbox" name="terms" required> 我已阅读并同意活动须知</label>
        </fieldset>
        <div class="actions">
          <button type="submit">提交报名</button>
          <button type="reset">清空表单</button>
        </div>
      </form>
      <p id="done">报名请求已提交。</p>
    </main>
  </body>
</html>`,
      '两个 fieldset 都有 legend；每个 input/textarea 有稳定名称；reset 不会触发提交；未勾选条款时 submit 被浏览器阻止；焦点在浅色与深色区域均清晰。',
    ),
  ),

  'programming:HTML5 · 表单、输入与验证：输入类型、自动填充与移动键盘': browserLab(
    '输入类型与填写效率',
    '根据数据形态选择 input type、inputmode、autocomplete 和 pattern，并用原生约束提供可见反馈。',
    browserTask(
      'html-css-input-types',
      '选择合适输入类型',
      '制作联系方式表单，分别采集手机号、邮箱、会议日期和满意度；借助正确的 type 与 autocomplete 减少输入错误。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>培训反馈联系方式</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #e9f1f7; color: #183047; font: 16px/1.65 system-ui, sans-serif; }
      form { width: min(38rem, calc(100% - 2rem)); margin: 2rem auto; padding: 1.5rem; background: white; border-left: .45rem solid #17758b; }
      h1 { margin-top: 0; }
      .field { display: grid; gap: .35rem; margin-bottom: 1rem; }
      label { font-weight: 750; }
      input, select { min-height: 2.75rem; padding: .55rem; border: 2px solid #71899d; border-radius: .3rem; font: inherit; background: white; }
      input:valid:not(:placeholder-shown) { border-color: #31845b; }
      input:invalid:not(:placeholder-shown) { border-color: #bc3e32; }
      .hint { color: #526b7c; font-size: .9rem; }
      button { min-height: 2.75rem; padding: .6rem 1rem; border: 0; border-radius: .3rem; color: white; background: #126478; font: inherit; font-weight: 750; }
      :focus-visible { outline: 3px solid #d27822; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <form action="#sent">
      <h1>培训反馈联系方式</h1>
      <div class="field">
        <label for="mobile">手机号</label>
        <input id="mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" pattern="[0-9]{11}" aria-describedby="mobile-hint" required>
        <span class="hint" id="mobile-hint">输入 11 位手机号，不加空格。</span>
      </div>
      <div class="field">
        <label for="mail">邮箱</label>
        <input id="mail" name="email" type="email" autocomplete="email" placeholder="name@example.cn" required>
      </div>
      <div class="field">
        <label for="follow-up">方便回访的日期</label>
        <input id="follow-up" name="followUp" type="date" autocomplete="off">
      </div>
      <div class="field">
        <label for="score">课程满意度</label>
        <select id="score" name="score" required>
          <option value="">请选择</option>
          <option value="5">5 · 很好</option>
          <option value="4">4 · 良好</option>
          <option value="3">3 · 一般</option>
        </select>
      </div>
      <button type="submit">保存反馈</button>
    </form>
    <p id="sent">反馈已保存。</p>
  </body>
</html>`,
      '手机号触发 tel 键盘提示，邮箱触发 email 键盘提示；11 位以外数字被 pattern 阻止；日期控件使用日期选择器；所有字段在桌面仍显示文本标签。',
    ),
    browserTask(
      'html-css-input-apply',
      '设计退订与验证状态',
      '创建一个账单提醒设置页，包含邮箱、提醒时间、频率、当前密码确认和退订按钮。不得依赖 placeholder 作为唯一名称。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>账单提醒设置</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f0e8; color: #31291e; font: 16px/1.65 system-ui, sans-serif; }
      .card { width: min(46rem, calc(100% - 2rem)); margin: 2rem auto; padding: clamp(1.2rem, 5vw, 2.5rem); background: #fffdf8; border: 1px solid #cfbea3; }
      h1 { margin: 0 0 .5rem; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
      .field { display: grid; gap: .35rem; }
      .wide { grid-column: 1 / -1; }
      label, legend { font-weight: 800; }
      input, select { min-height: 2.75rem; padding: .55rem; border: 2px solid #8d7a61; border-radius: .25rem; font: inherit; background: white; }
      fieldset { display: grid; gap: .55rem; margin: 0; border: 1px solid #b9a88f; padding: .8rem; }
      .radio { min-height: 2.25rem; display: flex; gap: .5rem; align-items: center; }
      .help { color: #665640; font-size: .9rem; }
      .actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .8rem; margin-top: 1.5rem; }
      button { min-height: 2.75rem; padding: .55rem 1rem; border: 2px solid #745c3c; border-radius: .25rem; font: inherit; font-weight: 800; }
      button[type="submit"] { color: white; background: #745c3c; }
      .danger { color: #8d271c; background: white; border-color: #8d271c; }
      :focus-visible { outline: 3px solid #177b5d; outline-offset: 2px; }
      @media (max-width: 37rem) { .grid { grid-template-columns: 1fr; } .wide { grid-column: auto; } }
    </style>
  </head>
  <body>
    <main class="card">
      <form action="#saved">
        <h1>账单提醒设置</h1>
        <p>提醒只用于账单到期前通知，不包含营销内容。</p>
        <div class="grid">
          <div class="field wide">
            <label for="billing-email">接收提醒的邮箱</label>
            <input id="billing-email" name="email" type="email" inputmode="email" autocomplete="email" aria-describedby="billing-help" required>
            <span class="help" id="billing-help">修改后需在邮箱中完成确认。</span>
          </div>
          <div class="field">
            <label for="remind-time">提醒时间</label>
            <input id="remind-time" name="remindAt" type="time" value="09:00" required>
          </div>
          <fieldset>
            <legend>提醒频率</legend>
            <label class="radio"><input type="radio" name="frequency" value="once" checked> 到期前一次</label>
            <label class="radio"><input type="radio" name="frequency" value="weekly"> 每周一次</label>
          </fieldset>
          <div class="field wide">
            <label for="account-password">输入当前密码确认修改</label>
            <input id="account-password" name="password" type="password" autocomplete="current-password" minlength="8" required>
          </div>
        </div>
        <div class="actions">
          <button type="submit">保存提醒</button>
          <button class="danger" type="button">停止全部提醒</button>
        </div>
      </form>
      <p id="saved">设置已保存。</p>
    </main>
  </body>
</html>`,
      '邮箱、时间、频率和密码都有可见名称；密码少于 8 位被浏览器阻止；停止按钮不会提交表单；输入数字或日期时移动端使用专门键盘与选择器；窄屏单列无裁切。',
    ),
  ),

  'programming:HTML5 · 媒体、表格与内容表达：img、srcset、sizes 与替代文本': browserLab(
    '响应式图片与替代文本',
    '结合 src、srcset、sizes、尺寸属性和 alt，让浏览器根据布局与像素密度选图，同时保持断网和辅助技术可用。',
    browserTask(
      'html-css-responsive-image-practice',
      '配置响应式产品图',
      '为产品卡片添加同比例内嵌图片候选、sizes 提示、固定宽高和描述性 alt，使图片在 320px 和桌面都不跳动。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>便携式环境传感器</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eef3f1; color: #1e302a; font: 16px/1.65 system-ui, sans-serif; }
      .product { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 1fr); gap: 2rem; width: min(72rem, calc(100% - 2rem)); margin: 2rem auto; padding: 1rem; background: white; border-radius: .5rem; }
      picture, img { display: block; width: 100%; height: auto; }
      img { aspect-ratio: 4 / 3; object-fit: cover; background: #dce9e5; border-radius: .35rem; }
      .details { align-self: center; padding: 1rem; }
      h1 { line-height: 1.15; }
      .spec { display: grid; grid-template-columns: auto 1fr; gap: .35rem 1rem; }
      .spec dt { font-weight: 800; }
      .spec dd { margin: 0; }
      @media (max-width: 46rem) { .product { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="product">
      <img
        src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgODAwIDYwMCI+PHJlY3Qgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNkY2U5ZTUiLz48cmVjdCB4PSIyNzAiIHk9IjE0MCIgd2lkdGg9IjI2MCIgaGVpZ2h0PSIzMjAiIHJ4PSIzNiIgZmlsbD0iIzI2NDYzYiIvPjxyZWN0IHg9IjMxNSIgeT0iMjAwIiB3aWR0aD0iMTcwIiBoZWlnaHQ9IjEwMCIgcng9IjEyIiBmaWxsPSIjOWNkY2M2Ii8+PGNpcmNsZSBjeD0iNDAwIiBjeT0iMzc1IiByPSIzMiIgZmlsbD0iI2UyOWYzZSIvPjwvc3ZnPg=="
        srcset="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgNDAwIDMwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiNkY2U5ZTUiLz48cmVjdCB4PSIxMzUiIHk9IjcwIiB3aWR0aD0iMTMwIiBoZWlnaHQ9IjE2MCIgcng9IjE4IiBmaWxsPSIjMjY0NjNiIi8+PHJlY3QgeD0iMTU3IiB5PSIxMDAiIHdpZHRoPSI4NSIgaGVpZ2h0PSI1MCIgcng9IjYiIGZpbGw9IiM5Y2RjYzYiLz48L3N2Zz4= 400w, data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNjAwIiB2aWV3Qm94PSIwIDAgODAwIDYwMCI+PHJlY3Qgd2lkdGg9IjgwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNkY2U5ZTUiLz48cmVjdCB4PSIyNzAiIHk9IjE0MCIgd2lkdGg9IjI2MCIgaGVpZ2h0PSIzMjAiIHJ4PSIzNiIgZmlsbD0iIzI2NDYzYiIvPjxyZWN0IHg9IjMxNSIgeT0iMjAwIiB3aWR0aD0iMTcwIiBoZWlnaHQ9IjEwMCIgcng9IjEyIiBmaWxsPSIjOWNkY2M2Ii8+PGNpcmNsZSBjeD0iNDAwIiBjeT0iMzc1IiByPSIzMiIgZmlsbD0iI2UyOWYzZSIvPjwvc3ZnPg== 800w"
        sizes="(max-width: 736px) 100vw, 54vw"
        width="800"
        height="600"
        decoding="async"
        alt="深绿色便携传感器，正面屏幕显示浅绿色空气质量曲线">
      <section class="details">
        <p>现场监测设备</p>
        <h1>便携式环境传感器</h1>
        <p>开机即记录温度、湿度与颗粒物变化，数据可离线保存。</p>
        <dl class="spec">
          <dt>续航</dt><dd>连续监测 18 小时</dd>
          <dt>防护</dt><dd>室内外日常防尘</dd>
        </dl>
      </section>
    </main>
  </body>
</html>`,
      '图片在无网络时可显示；width/height 保持 4:3 比例；Network 中 currentSrc 随视口变化；alt 能在图片列表中被单独理解；320px 无横向滚动。',
    ),
    browserTask(
      'html-css-responsive-image-apply',
      '区分信息图与装饰图',
      '制作一篇“低光照植物护理”文章。首图描述操作场景，装饰纹理的 alt 为空；提供 srcset/sizes 并保证断图时版式稳定。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>低光照植物护理</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f2eee4; color: #283228; font: 17px/1.8 Georgia, "Noto Serif SC", serif; }
      article { width: min(54rem, 100%); margin: auto; background: #fffdf7; }
      .hero { position: relative; display: grid; min-height: 20rem; overflow: hidden; background: linear-gradient(135deg, #294634, #778e65); }
      .hero img { width: 100%; height: clamp(18rem, 50vw, 32rem); object-fit: cover; display: block; }
      .hero-text { position: absolute; inset: auto 0 0; padding: clamp(1rem, 5vw, 3rem); color: white; background: linear-gradient(transparent, #0e2115dd); }
      h1 { margin: 0; font-size: clamp(2.3rem, 7vw, 5rem); line-height: 1; }
      .body { padding: clamp(1.2rem, 5vw, 4rem); }
      .body::before { content: ""; display: block; height: .5rem; margin-bottom: 2rem; background: repeating-linear-gradient(90deg, #2f5b3b 0 1rem, #e0b45f 1rem 2rem); }
      .decor { width: 8rem; height: 8rem; float: right; margin: 0 0 1rem 1rem; object-fit: contain; opacity: .3; }
      figure { margin: 2rem 0; }
      figcaption { font: .9rem/1.5 system-ui, sans-serif; color: #586358; }
      @media (max-width: 38rem) { .decor { display: none; } }
    </style>
  </head>
  <body>
    <article>
      <div class="hero">
        <img
          src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAwIiBoZWlnaHQ9IjkwMCIgdmlld0JveD0iMCAwIDE2MDAgOTAwIj48cmVjdCB3aWR0aD0iMTYwMCIgaGVpZ2h0PSI5MDAiIGZpbGw9IiM0ZTZmNTIiLz48cmVjdCB4PSIyMDAiIHk9IjU1MCIgd2lkdGg9IjEyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjODQ1YjNhIi8+PHBhdGggZD0iTTc0MCA1NTBDNzAwIDM4MCA1NTAgMzAwIDQ2MCAzNTBDNTUwIDQ2MCA2MjAgNTQwIDc0MCA1NTBaIiBmaWxsPSIjMjI0ZjNlIi8+PHBhdGggZD0iTTg2MCA1NTBDOTAwIDM2MCAxMDcwIDI4MCAxMTYwIDMzMEMxMDYwIDQ3MCA5ODAgNTMwIDg2MCA1NTBaIiBmaWxsPSIjMzI2NjQ2Ii8+PC9zdmc+"
          srcset="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiB2aWV3Qm94PSIwIDAgODAwIDQ1MCI+PHJlY3Qgd2lkdGg9IjgwMCIgaGVpZ2h0PSI0NTAiIGZpbGw9IiM0ZTZmNTIiLz48cmVjdCB4PSIxMDAiIHk9IjI3NSIgd2lkdGg9IjYwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiM4NDViM2EiLz48cGF0aCBkPSJNMzcwIDI3NUMzNTAgMTkwIDI3NSAxNTAgMjMwIDE3NUMyNzUgMjMwIDMxMCAyNzAgMzcwIDI3NVoiIGZpbGw9IiMyMjRmM2UiLz48L3N2Zz4= 800w, data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAwIiBoZWlnaHQ9IjkwMCIgdmlld0JveD0iMCAwIDE2MDAgOTAwIj48cmVjdCB3aWR0aD0iMTYwMCIgaGVpZ2h0PSI5MDAiIGZpbGw9IiM0ZTZmNTIiLz48cmVjdCB4PSIyMDAiIHk9IjU1MCIgd2lkdGg9IjEyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjODQ1YjNhIi8+PHBhdGggZD0iTTc0MCA1NTBDNzAwIDM4MCA1NTAgMzAwIDQ2MCAzNTBDNTUwIDQ2MCA2MjAgNTQwIDc0MCA1NTBaIiBmaWxsPSIjMjI0ZjNlIi8+PHBhdGggZD0iTTg2MCA1NTBDOTAwIDM2MCAxMDcwIDI4MCAxMTYwIDMzMEMxMDYwIDQ3MCA5ODAgNTMwIDg2MCA1NTBaIiBmaWxsPSIjMzI2NjQ2Ii8+PC9zdmc+ 1600w"
          sizes="100vw"
          width="1600"
          height="900"
          fetchpriority="high"
          alt="木架上两盆耐阴绿植，左侧叶片朝向纱窗散射光">
        <div class="hero-text">
          <p>室内种植手册</p>
          <h1>低光照植物护理</h1>
        </div>
      </div>
      <div class="body">
        <img class="decor" alt="" width="128" height="128" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij48Y2lyY2xlIGN4PSI2NCIgY3k9IjY0IiByPSI1MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmY1YjNiIiBzdHJva2Utd2lkdGg9IjgiLz48L3N2Zz4=">
        <p>低光照不等于完全无光。先把植物移到能看见天空的位置，再观察叶色、节间和盆土干燥速度。</p>
        <figure>
          <h2>每周观察顺序</h2>
          <ol>
            <li>记录叶片是否朝窗生长。</li>
            <li>手指插入土壤两厘米确认干湿。</li>
            <li>旋转花盆，让受光面均匀变化。</li>
          </ol>
          <figcaption>连续三周记录比单日判断更可靠。</figcaption>
        </figure>
      </div>
    </article>
  </body>
</html>`,
      '首图 alt 描述场景与光线方向；装饰图 alt 为空且不进入读屏；图片在 320px 和桌面保持宽高比；隐藏装饰图后正文仍完整；无外部图片请求。',
    ),
  ),

  'programming:HTML5 · 媒体、表格与内容表达：picture、figure 与图像决策': browserLab(
    'picture 与图文关系',
    '用 picture/source 根据媒体条件选择构图，用 figure、figcaption 建立图片与说明的语义关系，并保留 img 兜底。',
    browserTask(
      'html-css-picture-practice',
      '按屏幕方向选图',
      '使用 picture 为竖屏提供方形构图、宽屏提供横幅构图；图片与标题属于同一篇景点介绍。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>河谷步道观景台</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #dfe9ee; color: #26343a; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(72rem, 100%); margin: auto; padding: 1rem; }
      figure { margin: 0; background: #fff; padding: .7rem; box-shadow: 0 1rem 3rem #29424d22; }
      picture, img { display: block; width: 100%; }
      img { height: clamp(18rem, 55vw, 38rem); object-fit: cover; }
      figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem 1rem; padding: 1rem .5rem .4rem; color: #53656d; }
      figcaption strong { color: #26343a; }
      @media (max-width: 42rem) { img { height: 70vh; } }
    </style>
  </head>
  <body>
    <main>
      <h1>河谷步道观景台</h1>
      <p>步道全长 2.4 公里，观景台可俯瞰河谷转弯。</p>
      <figure>
        <picture>
          <source
            media="(max-width: 42rem)"
            srcset="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iMTAwMCIgdmlld0JveD0iMCAwIDgwMCAxMDAwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjEwMDAiIGZpbGw9IiM4YWJmYzYiLz48cGF0aCBkPSJNMCA3MDBMNDAwIDI1MEw4MDAgNzAwWiIgZmlsbD0iIzNlNjU1YiIvPjxwYXRoIGQ9Ik0wIDc1MEw4MDAgNzUwTDgwMCAxMDAwTDAgMTAwMFoiIGZpbGw9IiM1NjdlNTYiLz48L3N2Zz4=">
          <img
            width="1200"
            height="750"
            decoding="async"
            alt="从观景台栏杆望向河谷，步道沿左侧山坡弯曲"
            src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9Ijc1MCIgdmlld0JveD0iMCAwIDEyMDAgNzUwIj48cmVjdCB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI3NTAiIGZpbGw9IiM4YWJmYzYiLz48cGF0aCBkPSJNMCA1MjBMNjAwIDE4MEwxMjAwIDUyMFoiIGZpbGw9IiMzZTY1NWIiLz48cGF0aCBkPSJNMCA1NjBMMTIwMCA1NjBMMTIwMCA3NTBMMCA3NTBaIiBmaWxsPSIjNTY3ZTU2Ii8+PHBhdGggZD0iTTE1MCA3NTBDMzIwIDYxMCA0NjAgNTkwIDYwMCA1NjAiIHN0cm9rZT0iI2U4ZDZiMCIgc3Ryb2tlLXdpZHRoPSIyMCIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==">
        </picture>
        <figcaption>
          <strong>观景台向西北方向</strong>
          <span>午后逆光，护栏外禁止跨越。</span>
        </figcaption>
      </figure>
    </main>
  </body>
</html>`,
      '视口窄于 42rem 时 currentSrc 切换为方形资源；图片裁切不改变说明文字；figure 与 figcaption 在 DOM 中直接关联；所有图片来自 data URL。',
    ),
    browserTask(
      'html-css-picture-apply',
      '为食谱选择图文结构',
      '创建一篇“番茄香草烤面包”食谱，用 picture 选择横竖构图，用 figure 展示成品，步骤清单与图注不得互相重复。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>番茄香草烤面包食谱</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eee4d5; color: #34261e; font: 16px/1.7 system-ui, sans-serif; }
      main { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(18rem, .9fr); gap: 2rem; width: min(76rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { font: 800 clamp(2.4rem, 8vw, 5.5rem)/.95 Georgia, serif; margin: 0 0 1rem; color: #7b2d24; }
      h2 { margin-top: 2rem; }
      .recipe { align-self: center; }
      figure { margin: 0; align-self: start; position: sticky; top: 1rem; background: #fffaf0; padding: .7rem; border: 1px solid #c8ae8d; }
      img { display: block; width: 100%; height: clamp(20rem, 55vw, 34rem); object-fit: cover; }
      figcaption { padding: .75rem .25rem .2rem; color: #6e5744; font-size: .92rem; }
      li + li { margin-top: .45rem; }
      .tip { border-left: .3rem solid #b54c38; padding-left: .8rem; }
      @media (max-width: 50rem) {
        main { grid-template-columns: 1fr; }
        figure { position: static; order: -1; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="recipe">
        <p>四人份 · 25 分钟</p>
        <h1>番茄香草烤面包</h1>
        <p>酸香番茄铺在厚切面包上，边缘烤脆后再加新鲜香草。</p>
        <figure>
          <picture>
            <source
              media="(orientation: portrait)"
              srcset="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MDAiIGhlaWdodD0iMTAwMCIgdmlld0JveD0iMCAwIDcwMCAxMDAwIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjEwMDAiIGZpbGw9IiNmN2U2Y2UiLz48cmVjdCB4PSIxMjAiIHk9IjMyMCIgd2lkdGg9IjQ2MCIgaGVpZ2h0PSIzMjAiIHJ4PSIzMCIgZmlsbD0iI2QxODA0NSIvPjxjaXJjbGUgY3g9IjI1MCIgY3k9IjQyMCIgcj0iNjAiIGZpbGw9IiNjMjM1MjgiLz48Y2lyY2xlIGN4PSI0MjAiIGN5PSI1MDAiIHI9IjcyIiBmaWxsPSIjZGI1MTNmIi8+PC9zdmc+">
            <img
              width="1200"
              height="800"
              decoding="async"
              alt="烤盘中央放着番茄香草面包，木勺旁有一碟盐"
              src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjgwMCIgdmlld0JveD0iMCAwIDEyMDAgODAwIj48cmVjdCB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIGZpbGw9IiNmN2U2Y2UiLz48cmVjdCB4PSIyMDAiIHk9IjI0MCIgd2lkdGg9IjgwMCIgaGVpZ2h0PSIzMjAiIHJ4PSIzMCIgZmlsbD0iI2QxODA0NSIvPjxjaXJjbGUgY3g9IjQyMCIgY3k9IjM3MCIgcj0iNjAiIGZpbGw9IiNjMjM1MjgiLz48Y2lyY2xlIGN4PSI2ODAiIGN5PSI0MjAiIHI9IjcyIiBmaWxsPSIjZGI1MTNmIi8+PC9zdmc+">
          </picture>
          <figcaption>先烤面包，再铺番茄回炉 4 分钟，出炉后撒香草。</figcaption>
        </figure>
        <h2>操作顺序</h2>
        <ol>
          <li>番茄切半，与蒜末、盐和橄榄油拌匀。</li>
          <li>面包两面刷油，烤至边缘金黄。</li>
          <li>铺番茄烤到微皱，最后撒罗勒。</li>
        </ol>
        <p class="tip">图片只展示结果，温度和时间仍以步骤清单为准。</p>
      </section>
    </main>
  </body>
</html>`,
      '竖屏时选择纵向 source，横屏显示横幅图；figure 说明只讲摆盘边界；图片占位保持比例；窄屏成品图在前但正文序号仍完整。',
    ),
  ),

  'programming:HTML5 · 媒体、表格与内容表达：video、audio、track 与字幕': browserLab(
    '媒体元素与可访问替代',
    '使用 video/audio 的原生控件、poster、轨道与文字稿，让静音、无法播放或无法听见时仍能获得信息。',
    browserTask(
      'html-css-video-practice',
      '建立带字幕的视频卡片',
      '创建产品巡检短片说明区，设置原生 controls、poster、宽高、subtitle track 和紧随其后的文字摘要。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>泵站巡检短片</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #edf2f4; color: #22313a; font: 16px/1.7 system-ui, sans-serif; }
      main { width: min(60rem, 100%); margin: auto; padding: 1rem; }
      h1 { line-height: 1.2; }
      .player { padding: .6rem; background: #17262e; border-radius: .4rem; }
      video { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; background: #101b20; }
      .transcript { margin-top: 1rem; padding: 1rem 1.2rem; background: white; border-left: .35rem solid #2e7d7a; }
      .transcript h2 { margin-top: 0; }
      dl { display: grid; grid-template-columns: max-content 1fr; gap: .4rem 1rem; }
      dt { font-weight: 800; }
      dd { margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <p>安全培训 · 第 2 段</p>
      <h1>泵站开机前巡检</h1>
      <div class="player">
        <video controls playsinline preload="metadata" width="1280" height="720" poster="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgwIiBoZWlnaHQ9IjcyMCIgdmlld0JveD0iMCAwIDEyODAgNzIwIj48cmVjdCB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIGZpbGw9IiMxNzI2MmUiLz48cmVjdCB4PSIyNjAiIHk9IjE2MCIgd2lkdGg9Ijc2MCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiMzNzU2NjEiLz48Y2lyY2xlIGN4PSI2NDAiIGN5PSIzNjAiIHI9IjcwIiBmaWxsPSIjZTJhODNlIi8+PHBvbHlnb24gcG9pbnRzPSI2MjAsMzMwIDYyMCwzOTAgNjgwLDM2MCIgZmlsbD0iIzE3MjYyZSIvPjwvc3ZnPg==" aria-describedby="video-summary">
          <track kind="captions" srclang="zh" label="中文字幕" default src="data:text/vtt;charset=utf-8,WEBVTT%0A%0A00%3A00%3A00.000%20--%3E%2000%3A00%3A04.000%0A%E5%85%88%E7%A1%AE%E8%AE%A4%E6%80%A5%E5%81%9C%E9%94%AE%E5%92%8C%E6%8A%A4%E6%A0%8F%E3%80%82">
          当前浏览器无法播放视频，请阅读下方巡检摘要。
        </video>
      </div>
      <section class="transcript" aria-labelledby="summary-title">
        <h2 id="summary-title">视频摘要</h2>
        <p id="video-summary">巡检员先确认急停键复位，再检查护栏、仪表和排水口，最后记录泵体振动。</p>
        <dl>
          <dt>时长</dt><dd>4 分钟</dd>
          <dt>字幕</dt><dd>中文，默认开启</dd>
        </dl>
      </section>
    </main>
  </body>
</html>`,
      'video 使用原生控件且 poster 无需网络即可显示；中文字幕 track 默认开启；静音观看可读字幕；媒体不可播放时摘要仍包含关键动作和时长。',
    ),
    browserTask(
      'html-css-video-apply',
      '制作播客片段与文字稿',
      '为“夜间值班交接”音频建立 audio 控件、章节列表、完整文字稿和下载替代说明；不要依赖自动播放。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>夜间值班交接 · 音频记录</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #fbf7ef; color: #2c3029; font: 16px/1.75 system-ui, sans-serif; }
      main { display: grid; grid-template-columns: minmax(17rem, .8fr) minmax(0, 1.4fr); gap: 2rem; width: min(72rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      .audio-card { align-self: start; padding: 1.4rem; background: #253a33; color: #f4fff9; border-radius: .45rem; position: sticky; top: 1rem; }
      .audio-card h1 { line-height: 1.15; }
      audio { width: 100%; min-height: 3rem; margin: 1rem 0; accent-color: #dba84b; }
      .audio-card a { color: #ffe3a9; }
      .transcript { padding: 1.2rem 1.5rem; background: white; border: 1px solid #d8cfbf; }
      .transcript h2 { margin-top: 1.8rem; }
      .transcript h2:first-child { margin-top: 0; }
      dt { font-weight: 800; }
      .time { color: #6c675c; font-variant-numeric: tabular-nums; }
      @media (max-width: 50rem) { main { grid-template-columns: 1fr; } .audio-card { position: static; } }
    </style>
  </head>
  <body>
    <main>
      <section class="audio-card" aria-labelledby="episode-title">
        <p>运维播客 · 第 18 期</p>
        <h1 id="episode-title">夜间值班交接</h1>
        <p>两名工程师复盘告警、未完成变更和次日优先事项。</p>
        <audio controls preload="metadata" aria-describedby="audio-help">
          <p>当前浏览器不支持音频播放。完整内容见右侧文字稿。</p>
        </audio>
        <p id="audio-help">音频约 12 分钟。字幕不可用，以下文字稿为等价内容。</p>
        <a href="#transcript">跳到完整文字稿</a>
      </section>
      <article class="transcript" id="transcript">
        <h2>完整文字稿</h2>
        <p class="time">00:00</p>
        <p><strong>主持：</strong>先说明今晚最紧急的告警。</p>
        <p class="time">02:14</p>
        <p><strong>值班员：</strong>缓存命中率从 94% 降到 61%，但数据库延迟正常。我们冻结了配置发布。</p>
        <p class="time">06:40</p>
        <p><strong>主持：</strong>未完成变更如何处理？</p>
        <p class="time">07:05</p>
        <p><strong>值班员：</strong>镜像构建已通过，发布保留到明早观察窗口。</p>
        <h2>交接结论</h2>
        <ul>
          <li>缓存命中率继续每 15 分钟记录。</li>
          <li>配置发布保持冻结。</li>
          <li>明早 09:30 由白班复核。</li>
        </ul>
      </article>
    </main>
  </body>
</html>`,
      'audio 不自动播放且提供原生控件；文字稿包含时间点、对话人与交接结论；跳到文字稿链接有效；无音频能力时页面仍传达全部信息；窄屏无吸顶遮挡。',
    ),
  ),

  'programming:HTML5 · 媒体、表格与内容表达：table、caption、th 与数据关系': browserLab(
    '数据表格结构',
    '为行列数据建立 caption、thead、tbody、th 与 scope，让视觉扫描和辅助技术都能确定单元格属于哪一行、哪一列。',
    browserTask(
      'html-css-table-practice',
      '制作可读的能耗表',
      '用 caption 和行列 th 展示三个机房的月度用电；数字列右对齐，单位写入列标题。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>机房月度能耗</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 1rem; background: #eef1f5; color: #25313f; font: 16px/1.5 system-ui, sans-serif; }
      .wrap { overflow-x: auto; width: min(52rem, 100%); margin: 2rem auto; padding: 1rem; background: white; box-shadow: 0 .8rem 2rem #26374714; }
      h1 { margin-top: 0; }
      table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
      caption { text-align: left; padding: .7rem 0 1rem; color: #4b5d6e; }
      th, td { padding: .75rem; border-bottom: 1px solid #cbd4de; }
      thead th { color: white; background: #274c66; }
      tbody th { text-align: left; }
      td { text-align: right; }
      tfoot th, tfoot td { border-top: 3px double #70879a; font-weight: 800; }
      tbody tr:hover { background: #e9f1f6; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>基础设施月报</h1>
      <table>
        <caption>2026 年 10 月各机房用电量，单位：千瓦时</caption>
        <thead>
          <tr>
            <th scope="col">机房</th>
            <th scope="col">制冷</th>
            <th scope="col">计算设备</th>
            <th scope="col">合计</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">北区 A</th>
            <td>18,420</td>
            <td>31,260</td>
            <td>49,680</td>
          </tr>
          <tr>
            <th scope="row">东区 B</th>
            <td>21,760</td>
            <td>35,940</td>
            <td>57,700</td>
          </tr>
          <tr>
            <th scope="row">测试 C</th>
            <td>9,380</td>
            <td>12,410</td>
            <td>21,790</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">全部机房</th>
            <td>49,560</td>
            <td>79,610</td>
            <td>129,170</td>
          </tr>
        </tfoot>
      </table>
    </main>
  </body>
</html>`,
      'caption 说明时间、对象和单位；首列每行使用 th scope=row；列标题为 scope=col；窄屏出现表格局部横向滚动而不是整页溢出；读屏可关联“北区 A”和“制冷”。',
    ),
    browserTask(
      'html-css-table-apply',
      '组织跨班次排班表',
      '创建一周值班表，上午与下午各占一个表头列，行标题为日期；用 colgroup 区分工作日与周末，并在 caption 说明时区。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>服务台值班表</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f6f3ea; color: #333226; font: 16px/1.55 system-ui, sans-serif; }
      main { width: min(66rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { margin-bottom: .3rem; }
      .legend { display: flex; flex-wrap: wrap; gap: .5rem 1rem; padding: 0; list-style: none; color: #5d5a4b; }
      .legend span { display: inline-block; width: .8rem; height: .8rem; margin-right: .35rem; border: 1px solid #736f5f; }
      .scroll { overflow-x: auto; margin-top: 1rem; border: 1px solid #bfb8a7; background: white; }
      table { width: 100%; min-width: 42rem; border-collapse: collapse; }
      caption { padding: .9rem; text-align: left; font-weight: 700; background: #fffdf7; }
      th, td { padding: .8rem; border: 1px solid #d5cfc1; text-align: left; }
      thead th { background: #3e5547; color: white; }
      tbody th { background: #f1eee5; }
      .work { background: #e8f3ec; }
      .weekend { background: #fff3df; }
      .off { color: #756e60; }
    </style>
  </head>
  <body>
    <main>
      <h1>服务台值班表</h1>
      <p>表中时间均为北京时间。姓名旁数字为分机。</p>
      <ul class="legend" aria-label="班次图例">
        <li><span class="work"></span>工作日班</li>
        <li><span class="weekend"></span>周末班</li>
      </ul>
      <div class="scroll" tabindex="0" role="region" aria-label="值班表，可横向滚动">
        <table>
          <caption>2026 年 11 月 24 日至 30 日值班安排</caption>
          <colgroup>
            <col>
            <col class="work">
            <col class="work">
            <col class="weekend">
            <col class="weekend">
          </colgroup>
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">上午 08:00–12:00</th>
              <th scope="col">下午 12:00–18:00</th>
              <th scope="col">晚间 18:00–22:00</th>
              <th scope="col">备班</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">周二</th>
              <td>林晓 · 8121</td><td>周宁 · 8107</td><td class="off">不开放</td><td>韩松 · 8155</td>
            </tr>
            <tr>
              <th scope="row">周六</th>
              <td class="weekend">周宁 · 8107</td><td class="weekend">林晓 · 8121</td><td class="weekend">韩松 · 8155</td><td>陈可 · 8160</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </body>
</html>`,
      'caption 明确日期范围与时区；滚动区域可聚焦并有名称；colgroup 不影响语义关系；周末单元格同时有颜色和图例；表格溢出仅发生在自身。',
    ),
  ),

  'programming:HTML5 · 媒体、表格与内容表达：meta、Open Graph 与结构化数据': browserLab(
    '页面元数据',
    '在 head 中维护标题、描述、robots、主题色与社交分享元数据，确保它们和页面可见内容一致。',
    browserTask(
      'html-css-meta-practice',
      '为产品发布页补齐元数据',
      '为“智能阀门 v2 发布”页面添加 description、robots、theme-color 和两组 Open Graph 属性；标题需与 h1 一致。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="智能阀门 v2 新增压力异常预警、离线记录与更直观的现场校准流程。">
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="#155e63">
    <meta property="og:type" content="article">
    <meta property="og:title" content="智能阀门 v2 正式发布">
    <meta property="og:description" content="了解压力预警、离线记录与现场校准的新变化。">
    <title>智能阀门 v2 正式发布</title>
    <style>
      :root { --brand: #155e63; --accent: #e7a63d; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #eef7f5; color: #193330; font: 16px/1.7 system-ui, sans-serif; }
      header { padding: clamp(2rem, 9vw, 7rem) clamp(1rem, 6vw, 5rem); color: white; background: var(--brand); }
      header p { max-width: 40rem; }
      h1 { max-width: 16ch; margin: 0 0 1rem; font-size: clamp(2.5rem, 8vw, 6rem); line-height: .95; }
      main { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; padding: clamp(1rem, 5vw, 4rem); }
      article { padding: 1.4rem; background: white; border-top: .3rem solid var(--accent); }
      h2 { margin-top: 0; }
    </style>
  </head>
  <body>
    <header>
      <p>工业控制产品</p>
      <h1>智能阀门 v2 正式发布</h1>
      <p>压力异常预警、离线记录与现场校准流程同步升级。</p>
    </header>
    <main>
      <article>
        <h2>压力预警</h2>
        <p>超过设定阈值时在本地保留时间和压力快照。</p>
      </article>
      <article>
        <h2>离线记录</h2>
        <p>网络断开后继续保存最近 48 小时运行数据。</p>
      </article>
      <article>
        <h2>现场校准</h2>
        <p>三步引导降低误触，并保留上次校准值。</p>
      </article>
    </main>
  </body>
</html>`,
      'document.title、og:title 与可见 h1 一致；description 能在搜索结果语境中概括正文；theme-color 与页面品牌色一致；robots 没有阻止索引。',
    ),
    browserTask(
      'html-css-meta-apply',
      '建立课程详情页元数据',
      '为公开课程“CSS 网格布局入门”配置语言、描述、分享标题、分享摘要、发布日期和主题色；不得出现正文没讲的内容。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="从轨道、间距与自动放置开始，用 CSS Grid 构建可重排的课程卡片。">
    <meta name="author" content="远山设计学院">
    <meta name="theme-color" content="#3d4c36">
    <meta property="og:type" content="website">
    <meta property="og:title" content="CSS 网格布局入门">
    <meta property="og:description" content="练习轨道、间距、自动放置与响应式卡片布局。">
    <meta property="article:published_time" content="2026-11-24">
    <title>CSS 网格布局入门 · 远山设计学院</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f3efe3; color: #293027; font: 16px/1.7 Georgia, "Noto Serif SC", serif; }
      main { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(15rem, .6fr); gap: 2rem; width: min(70rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      .cover { display: grid; place-items: end start; min-height: 24rem; padding: 2rem; color: white; background: repeating-linear-gradient(90deg, #3d4c36 0 16.666%, #7b8f64 16.666% 33.333%); }
      h1 { max-width: 10ch; margin: 0; font-size: clamp(2.6rem, 8vw, 6rem); line-height: .94; }
      aside { align-self: start; padding: 1rem 1.2rem; background: #fffdf5; border-left: .35rem solid #bd6f31; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: .4rem .8rem; }
      dt { font-weight: 800; }
      dd { margin: 0; }
      @media (max-width: 48rem) { main { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="cover"><h1>CSS 网格布局入门</h1></div>
        <p>本课从轨道与间距开始，再把一组课程卡片重排为可响应容器宽度的网格。</p>
        <h2>学习目标</h2>
        <ul>
          <li>理解显式轨道与自动放置。</li>
          <li>用 minmax 控制可伸缩列宽。</li>
          <li>在窄容器中减少列数。</li>
        </ul>
      </article>
      <aside>
        <h2>课程信息</h2>
        <dl>
          <dt>发布</dt><dd><time datetime="2026-11-24">2026-11-24</time></dd>
          <dt>难度</dt><dd>入门</dd>
          <dt>时长</dt><dd>90 分钟</dd>
        </dl>
      </aside>
    </main>
  </body>
</html>`,
      'title 与分享标题都包含课程名并保持品牌后缀；发布日期和可见时间一致；description 与学习目标一致；页面只显示真实课程信息；窄屏改单列。',
    ),
  ),

  'programming:HTML5 · 可访问性、SEO 与国际化：键盘路径、焦点顺序与跳转链接': browserLab(
    '键盘焦点与跳过导航',
    '建立从跳过链接到主内容的稳定 Tab 路径，让焦点环、DOM 顺序和视觉阅读顺序一致。',
    browserTask(
      'html-css-focus-practice',
      '添加跳到主内容',
      '建立带页头导航的专题页，首个可聚焦元素为跳过链接；main 使用 tabindex=-1 接收焦点并保持可见焦点环。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>数据迁移专题</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f1f3f7; color: #1d2b39; }
      .skip { position: fixed; z-index: 10; top: .5rem; left: .5rem; transform: translateY(-150%); padding: .8rem 1rem; color: white; background: #111; }
      .skip:focus { transform: none; }
      header { display: flex; flex-wrap: wrap; gap: 1rem 2rem; align-items: center; justify-content: space-between; padding: 1rem clamp(1rem, 5vw, 4rem); background: #263f5b; color: white; }
      header a { color: white; }
      nav ul { display: flex; gap: 1rem; margin: 0; padding: 0; list-style: none; }
      main { padding: clamp(2rem, 8vw, 6rem) clamp(1rem, 5vw, 4rem); }
      main:focus { outline: .25rem solid #e08a30; outline-offset: -.25rem; }
      .content { max-width: 48rem; }
      h1 { font-size: clamp(2.3rem, 7vw, 5rem); line-height: 1; }
      a:focus-visible, button:focus-visible { outline: .2rem solid #f0a541; outline-offset: .2rem; }
    </style>
  </head>
  <body>
    <a class="skip" href="#main">跳到主要内容</a>
    <header>
      <p>基础设施学院</p>
      <nav aria-label="主导航">
        <ul>
          <li><a href="#main">专题</a></li>
          <li><a href="#main">文档</a></li>
          <li><a href="#main">讲师</a></li>
        </ul>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <div class="content">
        <p>数据库课程 · 第 7 讲</p>
        <h1>数据迁移专题</h1>
        <p>先按 Tab，确认跳过链接出现；按 Enter 后焦点应进入主要内容，而不是继续穿过三个导航链接。</p>
        <button type="button">开始阅读检查</button>
      </div>
    </main>
  </body>
</html>`,
      '页面首个 Tab 停在“跳到主要内容”；Enter 后 activeElement 为 main；焦点轮廓清晰；继续 Tab 到按钮；视觉顺序与 DOM 顺序一致。',
    ),
    browserTask(
      'html-css-focus-apply',
      '修复弹层入口的焦点路径',
      '创建“筛选面板已展开”的静态状态，让面板入口、关闭按钮、复选框与结果链接按合理顺序可聚焦，并提供回到结果区的跳转。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>项目筛选</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f1eb; color: #2f2a22; font: 16px/1.6 system-ui, sans-serif; }
      .skip { position: absolute; transform: translateY(-200%); padding: .7rem 1rem; background: #211d17; color: white; }
      .skip:focus { transform: none; }
      header { padding: 1.2rem 1.5rem; color: white; background: #304a3c; }
      .layout { display: grid; grid-template-columns: minmax(15rem, 20rem) 1fr; gap: 1.5rem; padding: 1.5rem; }
      aside { padding: 1rem; background: white; border: 2px solid #8b9d8e; }
      aside h2 { margin-top: 0; }
      .choice { display: flex; align-items: center; gap: .6rem; min-height: 2.75rem; }
      input { width: 1.2rem; height: 1.2rem; accent-color: #315b44; }
      button, a { touch-action: manipulation; }
      button { min-height: 2.75rem; padding: .5rem 1rem; border: 2px solid #7c342d; color: #7c342d; background: white; font: inherit; font-weight: 750; }
      .results { align-self: start; }
      .results article { padding: 1rem 1.2rem; background: white; border-bottom: 1px solid #d5cec2; }
      :focus-visible { outline: .22rem solid #d27624; outline-offset: .18rem; }
      @media (max-width: 46rem) { .layout { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <a class="skip" href="#results">跳过筛选，查看结果</a>
    <header>
      <p>建筑项目档案</p>
      <h1>筛选项目</h1>
    </header>
    <div class="layout">
      <aside aria-labelledby="filter-title">
        <h2 id="filter-title">筛选条件</h2>
        <p id="filter-state">已展开。选择完成后关闭面板继续浏览。</p>
        <div class="choice"><input id="filter-public" type="checkbox" checked><label for="filter-public">仅看公共建筑</label></div>
        <div class="choice"><input id="filter-local" type="checkbox"><label for="filter-local">仅看本地项目</label></div>
        <button type="button" aria-describedby="filter-state">关闭筛选面板</button>
      </aside>
      <main class="results" id="results" tabindex="-1">
        <h2>筛选结果</h2>
        <article><h3>滨河社区中心</h3><p>公共建筑 · 2025 年竣工</p></article>
        <article><h3>山脚图书站</h3><p>公共建筑 · 2026 年竣工</p></article>
        <p><a href="#results">应用筛选并返回结果标题</a></p>
      </main>
    </div>
  </body>
</html>`,
      '跳过链接在首个 Tab 出现；筛选面板顺序为两个复选框、关闭按钮；结果标题可程序化聚焦；所有焦点环在浅色背景可见；窄屏视觉顺序不改变 Tab 顺序。',
    ),
  ),

  'programming:CSS3 · 级联、继承与盒模型：作者样式、继承、层叠层与顺序': browserLab(
    '层叠、继承与来源',
    '用层叠层、继承和直接声明组织可预测的样式基线，再通过计算样式判断哪条规则真正获胜。',
    browserTask(
      'html-css-cascade-practice',
      '建立四层样式冲突',
      '在同一按钮上制造 reset、base、components 和未分层工具类的颜色冲突，让组件层最终胜出。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>层叠层实验</title>
    <style>
      @layer reset, base, components;
      * { box-sizing: border-box; }

      @layer reset {
        button { border: 0; font: inherit; }
      }

      @layer base {
        :root { color: #20302a; background: #edf2ee; font: 16px/1.6 system-ui, sans-serif; }
        button { color: #71351e; background: #ead9cf; }
        .panel { color: #285543; }
      }

      @layer components {
        .panel {
          width: min(42rem, calc(100% - 2rem));
          margin: 3rem auto;
          padding: 1.5rem;
          border: 1px solid #86a392;
          background: white;
        }
        .action {
          color: white;
          background: #2f6f4e;
          padding: .8rem 1.1rem;
          border-radius: .35rem;
        }
      }

      button:focus-visible { outline: .22rem solid #ca7728; outline-offset: .2rem; }
    </style>
  </head>
  <body>
    <main class="panel">
      <h1>层叠层实验</h1>
      <p>下面的按钮同时收到 reset、base 与 components 声明。</p>
      <button class="action" type="button">保存设置</button>
      <p>未分层规则尚未写入；添加前后比较计算样式中的来源与层名。</p>
    </main>
  </body>
</html>`,
      '按钮最终背景为 components 层的深绿色；Styles 面板可看到三层声明及被覆盖项；颜色没有依赖选择器书写顺序；键盘焦点仍可见。',
    ),
    browserTask(
      'html-css-cascade-apply',
      '控制继承与直接声明',
      '设计文章主题区域，让字体和正文颜色从容器继承，但按钮、标签和链接的背景与边框由自身规则决定。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>项目复盘主题</title>
    <style>
      @layer tokens, base, components;

      @layer tokens {
        :root {
          --ink: #28323a;
          --muted: #5b6973;
          --surface: #ffffff;
          --accent: #a04b28;
          --accent-soft: #f7e6dc;
        }
      }

      @layer base {
        * { box-sizing: border-box; }
        body { margin: 0; font: 16px/1.75 "Noto Serif SC", Georgia, serif; color: var(--ink); background: #ece9e2; }
        .article-theme { font-family: "Noto Sans SC", system-ui, sans-serif; color: #213d34; }
        a { color: inherit; }
      }

      @layer components {
        .review {
          width: min(54rem, calc(100% - 2rem));
          margin: 2rem auto;
          padding: clamp(1.2rem, 5vw, 3.5rem);
          background: var(--surface);
          border-top: .45rem solid var(--accent);
        }
        .kicker {
          display: inline-block;
          padding: .2rem .55rem;
          color: #7d2d15;
          background: var(--accent-soft);
          border: 1px solid #d79777;
          font: 700 .8rem/1.4 system-ui, sans-serif;
          letter-spacing: .04em;
        }
        .decision {
          margin-top: 2rem;
          padding: 1rem;
          border-inline-start: .3rem solid #4f7a65;
          background: #eff6f1;
        }
        .decision button {
          min-height: 2.75rem;
          padding: .55rem 1rem;
          border: 2px solid #315d47;
          color: white;
          background: #315d47;
          font: 700 .95rem/1.2 system-ui, sans-serif;
        }
        :focus-visible { outline: .22rem solid #d67b2a; outline-offset: .2rem; }
      }
    </style>
  </head>
  <body class="article-theme">
    <article class="review">
      <span class="kicker">季度复盘</span>
      <h1>减少重复配置改动</h1>
      <p>正文与链接继承文章主题的颜色和字体，但标签与按钮保留自己的视觉职责。</p>
      <div class="decision">
        <h2>决策</h2>
        <p>把环境差异集中到配置清单，应用代码只读取已校验的值。</p>
        <button type="button">标记为已评审</button>
      </div>
    </article>
  </body>
</html>`,
      '正文继承 article-theme 的字体与颜色；kicker 和 button 的直接声明覆盖继承；按钮边框与背景属于组件层；加长正文时标签不会拉伸；桌面与窄屏均无横向滚动。',
    ),
  ),

  'programming:CSS3 · 级联、继承与盒模型：选择器特异性与作用域': browserLab(
    '选择器边界',
    '用类、属性、伪类、:where 与 @scope 控制组件边界，避免层层加选择器和全局误伤。',
    browserTask(
      'html-css-specificity-practice',
      '比较选择器权重',
      '让同一组状态徽章分别受元素、类、属性和 :where 规则影响，并让状态规则在不使用 ID 的情况下胜出。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>选择器特异性实验</title>
    <style>
      body { margin: 0; padding: clamp(1rem, 5vw, 4rem); background: #f2f5f8; color: #22313c; font: 16px/1.6 system-ui, sans-serif; }
      .lab { width: min(52rem, 100%); margin: auto; }
      .row { display: flex; flex-wrap: wrap; gap: .8rem; margin: 1.5rem 0; padding: 1rem; background: white; border: 1px solid #c9d4dd; }

      span { background: #e1e7ec; color: #40505d; }
      .badge { padding: .55rem .8rem; border: 1px solid #8b9ba8; }
      .badge[data-state="warning"] { border-color: #a45e18; background: #fff0d6; color: #713d0a; }
      :where(.badge, .tag)[data-state="warning"] { font-weight: 800; }

      .note { padding: .8rem; border-inline-start: .3rem solid #497c6b; background: #edf7f2; }
      code { padding: .1rem .3rem; background: #dce7e1; }
    </style>
  </head>
  <body>
    <main class="lab">
      <h1>选择器特异性实验</h1>
      <div class="row">
        <span class="badge" data-state="normal">普通状态</span>
        <span class="badge" data-state="warning">警告状态</span>
        <span class="tag" data-state="warning">同名属性标签</span>
      </div>
      <p class="note">先把属性规则改成更弱的 <code>:where()</code>，观察警告背景是否丢失。</p>
    </main>
  </body>
</html>`,
      '警告徽章使用暖色背景和加粗字重；Styles 面板显示属性规则的来源；:where 本身不增加特异性；修改 class 名称时普通元素样式不会误伤。',
    ),
    browserTask(
      'html-css-specificity-apply',
      '为侧栏建立样式作用域',
      '建立包含两个卡片组的页面，使用 @scope 让主区域的卡片标题为青色、侧栏为棕色，同时保留共享卡片布局。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>组件作用域</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f1ea; color: #26312b; font: 16px/1.65 system-ui, sans-serif; }
      .dashboard { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(16rem, .6fr); gap: 1rem; width: min(72rem, 100%); margin: auto; padding: 1rem; }
      .card { padding: 1.1rem; background: white; border: 1px solid #c8c3b8; }
      .card h2 { margin-top: 0; }
      .card p { margin-bottom: 0; }
      .stack { display: grid; gap: .8rem; align-content: start; }

      @scope (.primary) to (.card) {
        h2 { color: #0d6470; text-decoration: underline .16em #8ac2c6; text-underline-offset: .2em; }
      }

      @scope (.side-panel) to (.card) {
        h2 { color: #7a4a22; border-inline-start: .22rem solid #c48345; padding-inline-start: .55rem; }
      }

      @media (max-width: 48rem) { .dashboard { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="dashboard">
      <section class="primary stack" aria-labelledby="primary-title">
        <h1 id="primary-title">运行概览</h1>
        <article class="card"><h2>请求成功率</h2><p>过去 24 小时为 99.94%。</p></article>
        <article class="card"><h2>发布队列</h2><p>当前没有等待审批的版本。</p></article>
      </section>
      <aside class="side-panel stack" aria-labelledby="side-title">
        <h2 id="side-title">维护提醒</h2>
        <article class="card"><h2>证书轮换</h2><p>剩余 21 天。</p></article>
        <article class="card"><h2>备份校验</h2><p>最近一次恢复演练通过。</p></article>
      </aside>
    </main>
  </body>
</html>`,
      '主区域卡片标题为青色，侧栏卡片标题为棕色；共享卡片背景和尺寸不变；@scope 到 .card 的边界阻止内部卡片被标题规则穿透；窄屏单列后颜色仍各自保持。',
    ),
  ),

  'programming:CSS3 · 级联、继承与盒模型：盒模型、逻辑属性与 box-sizing': browserLab(
    '尺寸与逻辑属性',
    '区分布局尺寸、内容盒与边框盒，使用 inline-size、margin-inline 和 padding-block 建立不受书写方向影响的布局。',
    browserTask(
      'html-css-box-model-practice',
      '比较 content-box 与 border-box',
      '并排放置两个声明宽度相同的盒子，一个使用 content-box，一个使用 border-box，观察最终外框宽度差异。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>盒模型对照</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: clamp(1rem, 5vw, 4rem); background: #edf2f4; color: #26343b; font: 16px/1.6 system-ui, sans-serif; }
      .stage { width: min(54rem, 100%); margin: auto; }
      .row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: start; }
      .box {
        width: 16rem;
        padding: 1.5rem;
        border: .7rem solid #23566a;
        background: #d8eef1;
      }
      .content { box-sizing: content-box; background: #f6dec2; border-color: #9a5d22; }
      .border { box-sizing: border-box; }
      .label { margin-block: 0 .5rem; font-weight: 800; }
      .measure { font-variant-numeric: tabular-nums; }
      .note { margin-block-start: 2rem; padding-block: .8rem; padding-inline-start: 1rem; border-inline-start: .3rem solid #3f7867; background: white; }
    </style>
  </head>
  <body>
    <main class="stage">
      <h1>16rem 到底指什么？</h1>
      <div class="row">
        <section class="box content">
          <h2 class="label">content-box</h2>
          <p>width 只计算内容；padding 和 border 再向外增加。</p>
        </section>
        <section class="box border">
          <h2 class="label">border-box</h2>
          <p>width 包含内容、padding 和 border，内容区自动缩小。</p>
        </section>
      </div>
      <p class="note measure">在 DevTools 的 Layout 面板展开盒模型，记录两个元素的总外框宽度。</p>
    </main>
  </body>
</html>`,
      '两个声明宽度都是 16rem；content-box 的总外框更宽；border-box 的外框保持 16rem；DevTools 盒模型图分别显示内容、内边距和边框。',
    ),
    browserTask(
      'html-css-box-model-apply',
      '用逻辑属性构建通知卡',
      '创建支持中文横排的通知卡，使用 inline-size、padding-inline、padding-block、margin-inline 与 border-inline-start。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>排班变更通知</title>
    <style>
      * { box-sizing: border-box; }
      :root { --ink: #24322d; --line: #63806f; --surface: #fffdf6; --accent: #c16b2b; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; color: var(--ink); background: #e7eee8; font: 16px/1.65 system-ui, sans-serif; }
      .notice {
        inline-size: min(44rem, 100%);
        padding-block: clamp(1rem, 4vw, 2rem);
        padding-inline: clamp(1rem, 5vw, 2.5rem);
        border: 1px solid var(--line);
        border-inline-start: .45rem solid var(--accent);
        background: var(--surface);
        box-shadow: 0 1rem 2.5rem #304a3b1c;
      }
      .notice > :first-child { margin-block-start: 0; }
      .notice > :last-child { margin-block-end: 0; }
      h1 { font-size: clamp(1.6rem, 5vw, 2.5rem); line-height: 1.15; }
      .meta { display: flex; flex-wrap: wrap; gap: .3rem 1rem; margin-block-end: 1.5rem; color: #56685e; }
      .callout { margin-inline: 0; padding-block: .8rem; padding-inline: 1rem; background: #f7e7d7; }
      @media (max-width: 30rem) {
        .notice { border-inline-start-width: .3rem; }
        .meta { display: block; }
      }
    </style>
  </head>
  <body>
    <main class="notice">
      <p class="meta"><span>客服中心</span><time datetime="2026-11-24">2026-11-24</time></p>
      <h1>周四晚班调整</h1>
      <p>原定 18:00 开始的晚班顺延 30 分钟，交接会议仍在三层会议室举行。</p>
      <p class="callout">请在周三 17:00 前确认新的到场时间。</p>
    </main>
  </body>
</html>`,
      '卡片宽度包含边框和内边距；accent 边框始终在书写方向起点；窄屏左右内边距缩小但文字不贴边；所有纵向间距使用逻辑属性，页面无横向溢出。',
    ),
  ),

  'programming:CSS3 · Flex、Grid 与页面布局：Flex 主轴、交叉轴、伸缩与换行': browserLab(
    'Flex 分配与换行',
    '掌握主交叉轴、flex-grow/shrink/basis、自动外边距与 min-width，让工具栏和列表项在真实宽度下可控。',
    browserTask(
      'html-css-flex-practice',
      '制作可换行工具栏',
      '使用 flex-wrap 构建搜索框、筛选按钮和新增按钮；搜索框可增长，按钮保持内容宽度。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>库存工具栏</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 1rem; background: #edf0f4; color: #263442; font: 16px/1.5 system-ui, sans-serif; }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: .75rem;
        width: min(58rem, 100%);
        margin: 2rem auto;
        padding: 1rem;
        background: white;
        border: 1px solid #c7d0da;
      }
      .search { flex: 1 1 16rem; min-width: 0; }
      .search input { width: 100%; min-height: 2.75rem; padding: .5rem .7rem; border: 2px solid #677d91; font: inherit; }
      button { flex: 0 0 auto; min-height: 2.75rem; padding: .5rem .85rem; border: 1px solid #546d82; background: #f7f9fb; font: inherit; font-weight: 700; }
      .primary { margin-inline-start: auto; color: white; background: #245d7b; border-color: #245d7b; }
      :focus-visible { outline: .2rem solid #d47a26; outline-offset: .15rem; }
      @media (max-width: 34rem) {
        .search { flex-basis: 100%; }
        .primary { margin-inline-start: 0; flex: 1 1 auto; }
      }
    </style>
  </head>
  <body>
    <section class="toolbar" aria-label="库存筛选工具栏">
      <label class="search">
        <span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">搜索库存</span>
        <input type="search" placeholder="物料名称或编号">
      </label>
      <button type="button">状态：全部</button>
      <button type="button">仓库</button>
      <button class="primary" type="button">新增物料</button>
    </section>
    <p style="width:min(58rem,100%);margin:0 auto;text-align:center;color:#586979">缩小窗口，观察搜索框先收缩再换行。</p>
  </body>
</html>`,
      '搜索框使用 flex-basis 16rem 并可收缩；按钮不被压缩；桌面新增按钮靠近末端；窄屏搜索框独占一行且按钮仍可点；min-width:0 允许搜索输入正确收缩。',
    ),
    browserTask(
      'html-css-flex-apply',
      '实现多行消息条目',
      '为消息列表建立图标、可截断标题与摘要、状态标签和操作按钮，使用 flex 主轴/交叉轴与 wrap 保持 320px 可用。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>构建通知列表</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f2ec; color: #2b2d28; font: 16px/1.55 system-ui, sans-serif; }
      .inbox { width: min(60rem, 100%); margin: auto; padding: 1rem; }
      h1 { margin-bottom: 1rem; }
      .message {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: .7rem 1rem;
        padding: 1rem;
        background: white;
        border-bottom: 1px solid #d8d1c4;
      }
      .icon { flex: 0 0 2.75rem; display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 50%; color: white; background: #486b59; font-weight: 900; }
      .copy { flex: 1 1 14rem; min-width: 0; }
      .copy h2 { overflow: hidden; margin: 0; font-size: 1rem; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
      .copy p { display: -webkit-box; overflow: hidden; margin: .2rem 0 0; color: #61645e; font-size: .92rem; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      .status { flex: 0 0 auto; padding: .2rem .5rem; border: 1px solid #9b6b27; color: #6a430d; background: #fff1d9; font-size: .8rem; font-weight: 750; }
      .actions { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: .4rem; }
      button { min-height: 2.75rem; padding: .45rem .7rem; border: 1px solid #737970; background: white; font: inherit; font-size: .9rem; }
      :focus-visible { outline: .2rem solid #1e7193; outline-offset: .15rem; }
      @media (max-width: 32rem) {
        .actions { flex-basis: 100%; padding-inline-start: 3.45rem; }
        button { flex: 1 1 auto; }
      }
    </style>
  </head>
  <body>
    <main class="inbox">
      <h1>构建通知</h1>
      <article class="message">
        <span class="icon" aria-hidden="true">构</span>
        <div class="copy">
          <h2>主分支构建等待审批</h2>
          <p>版本 2026.11.24-3 已通过单元测试，等待发布负责人确认生产变更窗口和回滚版本。</p>
        </div>
        <span class="status">待审批</span>
        <div class="actions">
          <button type="button">查看</button>
          <button type="button">批准</button>
        </div>
      </article>
      <article class="message">
        <span class="icon" aria-hidden="true">测</span>
        <div class="copy">
          <h2>夜间测试完成</h2>
          <p>浏览器兼容矩阵已全部通过，结果文件将在归档任务结束后保留七天。</p>
        </div>
        <span class="status">已完成</span>
        <div class="actions"><button type="button">报告</button></div>
      </article>
    </main>
  </body>
</html>`,
      '标题可单行截断、摘要最多两行；状态与按钮不会压扁文本；320px 下操作区换到下一行；图标保持 44px；Tab 顺序为查看、批准再下一消息。',
    ),
  ),

  'programming:CSS3 · Flex、Grid 与页面布局：Grid 轨道、minmax、自动放置与区域': browserLab(
    '网格轨道与区域',
    '使用显式列、minmax、auto-fit/auto-fill 和命名区域构建可重排页面，检查隐式行与自动放置边界。',
    browserTask(
      'html-css-grid-practice',
      '构建自适应卡片网格',
      '用 `repeat(auto-fit, minmax(14rem, 1fr))` 排列四张课程卡片，并让最后一张卡片跨两列展示重点内容。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>课程专题网格</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eaf0f2; color: #20313a; font: 16px/1.6 system-ui, sans-serif; }
      main { width: min(72rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { margin-bottom: 1.5rem; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        gap: 1rem;
        grid-auto-rows: minmax(11rem, auto);
      }
      article { display: flex; flex-direction: column; justify-content: space-between; padding: 1.2rem; background: white; border-top: .35rem solid #35708a; }
      article:last-child { grid-column: span 2; color: white; background: #213f4c; border-color: #d58b32; }
      h2 { line-height: 1.2; }
      p { margin-bottom: 0; }
      a { align-self: flex-start; color: #0e6379; font-weight: 750; }
      article:last-child a { color: #ffe0a7; }
      :focus-visible { outline: .2rem solid #d9842e; outline-offset: .2rem; }
      @media (max-width: 36rem) { article:last-child { grid-column: auto; } }
    </style>
  </head>
  <body>
    <main>
      <p>专题学习 · 4 门</p>
      <h1>把服务做稳定</h1>
      <section class="grid" aria-label="课程卡片">
        <article><div><h2>请求追踪</h2><p>从入口到数据库记录同一条关联编号。</p></div><a href="#grid">开始课程</a></article>
        <article><div><h2>错误预算</h2><p>用可接受失败率决定发布节奏。</p></div><a href="#grid">开始课程</a></article>
        <article><div><h2>容量评估</h2><p>把峰值流量换算为可验证的资源余量。</p></div><a href="#grid">开始课程</a></article>
        <article><div><h2>故障演练</h2><p>在真实值班流程中验证告警、沟通与回滚，而不是只检查单条命令。</p></div><a href="#grid">进入综合练习</a></article>
      </section>
    </main>
  </body>
</html>`,
      '宽容器出现多列，窄容器卡片自动减少列数；最后一张卡片桌面跨两列、320px 恢复单列；卡片内链接始终贴底；无固定 14rem 溢出。',
    ),
    browserTask(
      'html-css-grid-apply',
      '搭建命名区域后台',
      '使用 grid-template-areas 布局页头、侧栏、通知、主内容和页脚；窄屏重排为单列并保持 DOM 阅读顺序。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>工单运营台</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eceff3; color: #22313b; font: 16px/1.6 system-ui, sans-serif; }
      .app {
        display: grid;
        grid-template-columns: 15rem minmax(0, 1fr) 18rem;
        grid-template-rows: auto auto 1fr auto;
        grid-template-areas:
          "head head head"
          "side notice notice"
          "side main aside"
          "foot foot foot";
        gap: 1rem;
        min-height: 100vh;
        padding: 1rem;
      }
      .app > * { padding: 1rem; background: white; border: 1px solid #c5cfd8; }
      .app > header { grid-area: head; color: white; background: #294b5c; }
      .app > nav { grid-area: side; }
      .notice { grid-area: notice; background: #fff2d9; border-color: #c38a35; }
      main { grid-area: main; }
      aside { grid-area: aside; }
      footer { grid-area: foot; color: #53616b; }
      h1, h2 { line-height: 1.2; }
      nav ul { display: grid; gap: .35rem; margin: 0; padding: 0; list-style: none; }
      nav a { display: block; min-height: 2.75rem; padding: .55rem; color: #1e566b; }
      nav a[aria-current="page"] { background: #dcecf1; font-weight: 800; }
      :focus-visible { outline: .2rem solid #cc7624; outline-offset: .2rem; }
      @media (max-width: 52rem) {
        .app {
          grid-template-columns: 1fr;
          grid-template-rows: none;
          grid-template-areas: "head" "notice" "side" "main" "aside" "foot";
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <header><p>服务运营</p><h1>工单运营台</h1></header>
      <nav aria-label="后台导航">
        <h2>导航</h2>
        <ul>
          <li><a href="#main" aria-current="page">待处理工单</a></li>
          <li><a href="#main">已分配</a></li>
          <li><a href="#main">运行报告</a></li>
        </ul>
      </nav>
      <div class="notice" role="status">凌晨 03:10 的批量任务已完成。</div>
      <main id="main">
        <h2>今日待处理</h2>
        <p>有 6 张工单将在两小时内超过响应时限。</p>
      </main>
      <aside>
        <h2>值班信息</h2>
        <p>负责人：林晓 · 分机 8121</p>
      </aside>
      <footer>数据每 5 分钟更新一次</footer>
    </div>
  </body>
</html>`,
      '桌面页头跨三列、侧栏跨两行、通知横跨主区与侧栏；窄屏按页头、通知、导航、主内容、侧栏、页脚单列；DOM 顺序与窄屏阅读顺序一致。',
    ),
  ),

  'programming:CSS3 · 响应式、容器查询与移动布局：视口、媒体查询与内容断点': browserLab(
    '视口断点与内容压力',
    '根据内容何时拥挤设置范围媒体查询，验证列数、导航和触控布局，而不是照搬设备型号。',
    browserTask(
      'html-css-media-practice',
      '让课程卡片跨三档重排',
      '使用范围媒体查询在窄、中、宽视口分别显示 1、2、3 列；标题和说明在每一档都能完整阅读。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>响应式课程目录</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f7f4ed; color: #322f29; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(74rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { font-size: clamp(2.2rem, 7vw, 5rem); line-height: 1; }
      .courses { display: grid; grid-template-columns: 1fr; gap: 1rem; }
      article { padding: 1.2rem; background: white; border: 1px solid #cec5b5; }
      article h2 { margin-top: 0; }
      .tag { display: inline-block; padding: .2rem .5rem; color: #5d3b14; background: #f4dfb9; font-size: .82rem; font-weight: 750; }

      @media (min-width: 40rem) {
        .courses { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      @media (min-width: 70rem) {
        .courses { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
    </style>
  </head>
  <body>
    <main>
      <p>学习路径 · 入门</p>
      <h1>把页面做稳</h1>
      <section class="courses" aria-label="响应式课程卡片">
        <article><span class="tag">布局</span><h2>内容驱动断点</h2><p>观察卡片在增加文字后何时显得拥挤，再选择切换列数的宽度。</p></article>
        <article><span class="tag">输入</span><h2>键盘与触控</h2><p>按钮尺寸和焦点顺序要同时适配鼠标、触摸与键盘。</p></article>
        <article><span class="tag">主题</span><h2>颜色与对比</h2><p>让状态不只依赖颜色，并验证浅色和深色背景。</p></article>
        <article><span class="tag">性能</span><h2>图片加载</h2><p>根据显示尺寸控制下载，预留宽高避免内容移动。</p></article>
      </section>
    </main>
  </body>
</html>`,
      '宽度小于 40rem 为单列；640px 左右为两列；1120px 左右为三列；切换时卡片不重叠；长标题换行而不裁切；页面本身没有横向滚动。',
    ),
    browserTask(
      'html-css-media-apply',
      '适配桌面与移动导航',
      '建立桌面横向导航和移动两列操作区，在 320px 保持最小触控高度；用媒体查询只改变布局，不隐藏任务。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>社区服务中心</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #17333b; background: #e7f0f1; font: 16px/1.65 system-ui, sans-serif; }
      .site-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem clamp(1rem, 5vw, 4rem); color: white; background: #195666; }
      .brand { margin: 0; font-size: 1.15rem; font-weight: 850; }
      nav ul { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; list-style: none; }
      nav a { display: grid; place-items: center; min-height: 2.75rem; padding: .55rem .8rem; color: white; text-underline-offset: .2em; }
      main { width: min(64rem, 100%); margin: auto; padding: clamp(1.2rem, 5vw, 4rem) 1rem; }
      h1 { max-width: 15ch; font-size: clamp(2.5rem, 8vw, 5.5rem); line-height: .96; }
      .services { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-top: 2rem; }
      .services a { display: flex; min-height: 9rem; padding: 1.2rem; align-items: end; color: #17333b; background: white; border-top: .35rem solid #2d7e83; text-decoration-thickness: .12em; text-underline-offset: .25em; }
      :focus-visible { outline: .22rem solid #f0a13d; outline-offset: .18rem; }
      @media (max-width: 46rem) {
        .site-head { align-items: stretch; }
        nav { flex-basis: 100%; }
        nav ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        nav a { border: 1px solid #6d9aa3; }
        .services { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header class="site-head">
      <p class="brand">滨河社区中心</p>
      <nav aria-label="主要服务">
        <ul>
          <li><a href="#services">办事指南</a></li>
          <li><a href="#services">活动报名</a></li>
          <li><a href="#services">场馆开放</a></li>
          <li><a href="#services">联系我们</a></li>
        </ul>
      </nav>
    </header>
    <main>
      <p>开放时间 08:30–20:00</p>
      <h1>今天来中心能办什么？</h1>
      <section class="services" id="services" aria-label="服务入口">
        <a href="#services">预约社区会议室</a>
        <a href="#services">查询活动剩余名额</a>
        <a href="#services">提交公共设施报修</a>
      </section>
    </main>
  </body>
</html>`,
      '桌面导航单行，移动端变为 2×2 网格且四项全部可见；每个链接高度至少 44px；服务卡移动端单列；320px 下标题、导航和数据无横向溢出。',
    ),
  ),

  'programming:CSS3 · 响应式、容器查询与移动布局：容器查询与组件自适应': browserLab(
    '容器驱动的组件',
    '使用 container-type、container-name 与 @container，让同一组件的横排/纵排由所在容器宽度决定。',
    browserTask(
      'html-css-container-practice',
      '让卡片随容器切换',
      '把同一张课程卡放入 18rem 侧栏和宽主区；小于 32rem 的容器使用纵排，较宽容器使用横排。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>容器查询卡片</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #edf1f3; color: #26353e; font: 16px/1.6 system-ui, sans-serif; }
      .layout { display: grid; grid-template-columns: minmax(17rem, 22rem) minmax(0, 1fr); gap: 1.5rem; width: min(72rem, 100%); margin: auto; padding: 1rem; }
      .zone { container-type: inline-size; container-name: course-zone; padding: 1rem; background: #dfe8eb; }
      .wide-zone { background: #f4eee3; }
      .course-card {
        display: grid;
        gap: 1rem;
        padding: 1rem;
        background: white;
        border: 1px solid #b8c8cf;
      }
      .visual { display: grid; place-items: center; min-height: 7rem; color: white; background: repeating-linear-gradient(135deg, #315f6d 0 1rem, #497c87 1rem 2rem); font-size: 2rem; font-weight: 900; }
      .course-card h2 { margin: 0; line-height: 1.2; }
      .course-card p { margin-bottom: 0; }
      @container course-zone (min-width: 32rem) {
        .course-card { grid-template-columns: 10rem minmax(0, 1fr); align-items: center; }
        .visual { min-height: 8rem; }
      }
      @media (max-width: 52rem) { .layout { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="layout">
      <section class="zone" aria-label="窄侧栏">
        <h1>窄侧栏</h1>
        <article class="course-card">
          <div class="visual" aria-hidden="true">CSS</div>
          <div><h2>响应式布局</h2><p>容器较窄时图片在上、文字在下。</p></div>
        </article>
      </section>
      <section class="zone wide-zone" aria-label="宽主区">
        <h1>宽主区</h1>
        <article class="course-card">
          <div class="visual" aria-hidden="true">CSS</div>
          <div><h2>响应式布局</h2><p>容器达到 32rem 后，图片与文字切换为左右排列。</p></div>
        </article>
      </section>
    </main>
  </body>
</html>`,
      '同一卡片在窄侧栏纵排、宽主区横排；缩窄浏览器时主区卡片可独立切换而不由视口唯一决定；两个 zone 都有 container 名称和尺寸包含。',
    ),
    browserTask(
      'html-css-container-apply',
      '为数据摘要组件提供回退',
      '制作可在窄容器中堆叠、宽容器中分栏的运维摘要；用 @supports 提供不支持容器查询时的完整布局。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>运维摘要组件</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eef1ed; color: #26362d; font: 16px/1.6 system-ui, sans-serif; }
      .page { display: grid; grid-template-columns: minmax(0, 1fr) 19rem; gap: 1rem; width: min(72rem, 100%); margin: auto; padding: 1rem; }
      .holder { container: dashboard-card / inline-size; min-width: 0; padding: 1rem; background: #dfe8e0; }
      .summary { display: grid; gap: 1rem; padding: 1rem; background: white; border: 1px solid #9eafa3; }
      .metric { padding: .8rem; background: #eef5f0; border-inline-start: .25rem solid #317256; }
      .metric strong { display: block; font-size: 1.8rem; line-height: 1.1; }
      .summary h2 { margin: 0; }
      .summary p { margin: 0; }
      @supports (container-type: inline-size) {
        @container dashboard-card (min-width: 34rem) {
          .summary { grid-template-columns: 1.2fr repeat(3, minmax(7rem, .6fr)); align-items: center; }
          .summary > header { grid-column: 1 / -1; }
        }
      }
      @media (max-width: 52rem) { .page { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="holder" aria-label="主监控区">
        <div class="summary">
          <header><h1>服务健康摘要</h1><p>最近 15 分钟</p></header>
          <div class="metric"><span>请求成功率</span><strong>99.96%</strong></div>
          <div class="metric"><span>P95 延迟</span><strong>184 ms</strong></div>
          <div class="metric"><span>待处理告警</span><strong>2</strong></div>
        </div>
      </section>
      <section class="holder" aria-label="窄侧栏">
        <div class="summary">
          <header><h2>值班摘要</h2><p>交接前检查</p></header>
          <div class="metric"><span>未关闭告警</span><strong>1</strong></div>
          <div class="metric"><span>变更冻结</span><strong>是</strong></div>
        </div>
      </section>
    </main>
  </body>
</html>`,
      '宽主区摘要在标题下排四列，窄侧栏保持纵向堆叠；删除 @supports 后回退组件仍完整可读；容器宽度变化时没有文字重叠；320px 无溢出。',
    ),
  ),

  'programming:CSS3 · 响应式、容器查询与移动布局：触控目标、安全区和拇指区域': browserLab(
    '触控尺寸与安全区',
    '让关键操作达到可靠触控尺寸，避开底部安全区和拇指误触区域，并在横竖屏保持可达。',
    browserTask(
      'html-css-touch-practice',
      '制作符合触控尺寸的工具栏',
      '为移动端收藏、分享和删除操作设置至少 44×44px 目标、明确间距和 focus-visible，不使用悬浮才出现的唯一入口。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>文章操作栏</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #26313a; background: #f4f2ed; font: 16px/1.65 system-ui, sans-serif; }
      article { max-width: 44rem; margin: auto; padding: 2rem 1rem 8rem; }
      h1 { font-size: clamp(2rem, 8vw, 4rem); line-height: 1.05; }
      .toolbar {
        position: fixed;
        inset: auto 0 0;
        z-index: 2;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: .5rem;
        padding: .7rem max(.7rem, env(safe-area-inset-right)) calc(.7rem + env(safe-area-inset-bottom)) max(.7rem, env(safe-area-inset-left));
        background: #fffffff2;
        border-top: 1px solid #b8b3aa;
        backdrop-filter: blur(8px);
      }
      button {
        min-width: 2.75rem;
        min-height: 2.75rem;
        padding: .55rem;
        border: 1px solid #667985;
        border-radius: .35rem;
        color: #1d3e51;
        background: white;
        font: 700 .92rem/1.25 system-ui, sans-serif;
        touch-action: manipulation;
      }
      button.danger { color: #832d25; border-color: #a85a51; }
      :focus-visible { outline: .22rem solid #d17c27; outline-offset: .15rem; }
      @media (max-width: 24rem) {
        .toolbar { grid-template-columns: 1fr 1fr; }
        button.danger { grid-column: 1 / -1; }
      }
    </style>
  </head>
  <body>
    <article>
      <p>现场记录</p>
      <h1>暴雨后设备巡检</h1>
      <p>先检查配电箱进水和接地状态，再记录泵体振动。发现异常时停止开启设备并联系值班负责人。</p>
      <p>操作栏固定在底部，为正文保留足够滚动空间。</p>
    </article>
    <nav class="toolbar" aria-label="文章操作">
      <button type="button">收藏</button>
      <button type="button">分享</button>
      <button class="danger" type="button">删除草稿</button>
    </nav>
  </body>
</html>`,
      '三个按钮的实际边界均至少 44×44px；底部内边距包含 safe-area；正文末尾不会被工具栏遮挡；320px 下删除按钮独占一行；键盘焦点可见。',
    ),
    browserTask(
      'html-css-touch-apply',
      '布置拇指区快捷操作',
      '为巡检移动页设计底部四宫格快捷入口，使用 minmax、aspect-ratio 和 safe-area；滚动内容与固定操作区不得互相遮盖。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>巡检快捷入口</title>
    <style>
      * { box-sizing: border-box; }
      :root { --ink: #172f29; --paper: #f7f4ec; --brand: #276456; --line: #a9b8ae; }
      body { margin: 0; min-height: 100dvh; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      .screen { display: grid; grid-template-rows: auto 1fr auto; min-height: 100dvh; }
      header { padding: calc(1rem + env(safe-area-inset-top)) 1rem 1rem; color: white; background: var(--brand); }
      header h1 { margin: 0; font-size: clamp(1.6rem, 6vw, 2.4rem); }
      main { overflow-y: auto; padding: 1rem 1rem 2rem; }
      .record { padding: 1rem; background: white; border-inline-start: .3rem solid #bd762d; }
      .quick {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: .5rem;
        padding-block: .7rem calc(.7rem + env(safe-area-inset-bottom));
        padding-inline: max(.7rem, env(safe-area-inset-left)) max(.7rem, env(safe-area-inset-right));
        background: #e3eae5;
        border-top: 1px solid var(--line);
      }
      .quick a {
        display: grid;
        place-items: center;
        aspect-ratio: 1;
        min-width: 2.75rem;
        min-height: 2.75rem;
        padding: .45rem;
        color: #173d31;
        background: white;
        border: 1px solid #789487;
        border-radius: .35rem;
        text-align: center;
        text-decoration: none;
        font-size: .82rem;
        font-weight: 750;
      }
      .quick a[aria-current="page"] { color: white; background: #315d4c; }
      :focus-visible { outline: .22rem solid #da8a32; outline-offset: .15rem; }
      @media (max-width: 22rem) { .quick { grid-template-columns: repeat(2, minmax(0, 1fr)); } .quick a { aspect-ratio: auto; min-height: 3rem; } }
      @media (orientation: landscape) and (max-height: 30rem) { .quick { grid-template-columns: repeat(4, minmax(3rem, 1fr)); } .quick a { aspect-ratio: auto; min-height: 2.75rem; } }
    </style>
  </head>
  <body>
    <div class="screen">
      <header><p>滨河泵站</p><h1>今日巡检</h1></header>
      <main>
        <div class="record">
          <h2>下一步：二号泵振动</h2>
          <p>设备停机并挂牌后再测量。记录横向、纵向和轴向三个读数。</p>
          <p>下方快捷入口保持在拇指容易到达的位置。</p>
        </div>
      </main>
      <nav class="quick" aria-label="巡检快捷入口">
        <a href="#top" aria-current="page">首页</a>
        <a href="#scan">扫码</a>
        <a href="#record">记录</a>
        <a href="#help">求助</a>
      </nav>
    </div>
  </body>
</html>`,
      '四个入口在常见竖屏保持 1:1 且至少 44px；超窄屏和低高度横屏会重排但入口不消失；底部安全区内边距生效；主内容独立滚动且最后一段可读。',
    ),
  ),

  'programming:CSS3 · 设计 Token、主题与可访问性：语义变量、Token 与主题切换': browserLab(
    '语义令牌与主题',
    '把颜色、间距和字体抽象为语义变量，让组件只引用角色名，并通过根属性切换整套主题。',
    browserTask(
      'html-css-tokens-practice',
      '为价格卡定义语义令牌',
      '在 :root 定义 surface、text、muted、accent 与 spacing 令牌，让价格卡的背景、边线和按钮都引用变量。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>团队版价格卡</title>
    <style>
      :root {
        color-scheme: light;
        --color-surface: #fffdf8;
        --color-surface-muted: #f2ede3;
        --color-text: #27251f;
        --color-text-muted: #655f53;
        --color-accent: #1f6755;
        --color-on-accent: #ffffff;
        --space-page: clamp(1rem, 5vw, 4rem);
        --radius-card: .5rem;
        font-family: system-ui, sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: var(--space-page); color: var(--color-text); background: var(--color-surface-muted); }
      .price-card { width: min(28rem, 100%); padding: 1.5rem; background: var(--color-surface); border: 1px solid color-mix(in srgb, var(--color-text) 24%, transparent); border-radius: var(--radius-card); box-shadow: 0 1rem 2rem #27251f18; }
      .eyebrow { color: var(--color-accent); font-weight: 800; }
      .amount { margin: 0; font-size: clamp(2.8rem, 12vw, 5rem); font-weight: 850; line-height: 1; }
      .unit, .description { color: var(--color-text-muted); }
      ul { padding-inline-start: 1.2rem; }
      button { min-height: 2.75rem; width: 100%; padding: .65rem 1rem; border: 0; border-radius: .3rem; color: var(--color-on-accent); background: var(--color-accent); font: inherit; font-weight: 800; }
      :focus-visible { outline: .22rem solid #d17f2b; outline-offset: .18rem; }
    </style>
  </head>
  <body>
    <section class="price-card">
      <p class="eyebrow">团队版</p>
      <p class="amount">¥129 <span class="unit">/ 月</span></p>
      <p class="description">适合 5 至 20 人团队。</p>
      <ul>
        <li>共享模板和审阅记录</li>
        <li>每月 500 次自动化运行</li>
      </ul>
      <button type="button">开始 14 天试用</button>
    </section>
  </body>
</html>`,
      '价格卡组件只引用语义变量；修改 --color-accent 会同时改变强调文字和按钮；spacing 与 radius 令牌可在根节点统一调整；文本与背景对比清晰。',
    ),
    browserTask(
      'html-css-tokens-apply',
      '建立双主题组件令牌',
      '为通知中心建立亮暗两套语义令牌，通过 `data-theme` 切换；组件不得引用 red-500、gray-100 一类原始色阶名。',
      `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>通知中心主题</title>
    <style>
      :root {
        color-scheme: light dark;
        --font-ui: system-ui, sans-serif;
        --space-1: .5rem;
        --space-2: 1rem;
        --space-3: 1.5rem;
        --radius: .45rem;
        --surface-page: #f3f4f8;
        --surface-card: #ffffff;
        --surface-raised: #ffffff;
        --text-primary: #202636;
        --text-secondary: #596174;
        --border-subtle: #cbd1dd;
        --status-info-bg: #e9f2ff;
        --status-info-text: #164c85;
      }
      [data-theme="dark"] {
        --surface-page: #151a24;
        --surface-card: #202735;
        --surface-raised: #293243;
        --text-primary: #f1f5fb;
        --text-secondary: #bdc7d7;
        --border-subtle: #4b586c;
        --status-info-bg: #183d60;
        --status-info-text: #d9ecff;
      }
      * { box-sizing: border-box; }
      body { margin: 0; padding: var(--space-3); color: var(--text-primary); background: var(--surface-page); font-family: var(--font-ui); transition: background-color .25s, color .25s; }
      .inbox { width: min(52rem, 100%); margin: auto; }
      .inbox > header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); align-items: center; }
      .notice { display: grid; grid-template-columns: auto 1fr; gap: var(--space-2); padding: var(--space-2); background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: var(--radius); }
      .notice + .notice { margin-top: var(--space-1); }
      .marker { width: .7rem; min-height: 100%; border-radius: 99px; background: var(--status-info-text); }
      .meta { margin: 0; color: var(--text-secondary); font-size: .88rem; }
      .notice h2 { margin: .2rem 0; line-height: 1.3; }
      .notice p { margin: 0; }
      .badge { display: inline-block; margin-top: var(--space-1); padding: .18rem .45rem; color: var(--status-info-text); background: var(--status-info-bg); border: 1px solid currentColor; font-size: .8rem; font-weight: 750; }
      .surface-demo { margin-top: var(--space-2); padding: var(--space-2); background: var(--surface-raised); border: 1px solid var(--border-subtle); }
      @media (prefers-reduced-motion: reduce) { body { transition: none; } }
    </style>
  </head>
  <body data-theme="dark">
    <main class="inbox">
      <header>
        <div><p>工作区</p><h1>通知中心</h1></div>
        <p>当前主题：深色</p>
      </header>
      <section aria-label="通知列表">
        <article class="notice">
          <span class="marker" aria-hidden="true"></span>
          <div><p class="meta">今天 09:42 · 发布</p><h2>预览环境已更新</h2><p>版本 248 可通过团队内网预览。</p><span class="badge">信息</span></div>
        </article>
        <article class="notice">
          <span class="marker" aria-hidden="true"></span>
          <div><p class="meta">昨天 17:20 · 审阅</p><h2>设计令牌变更已批准</h2><p>新的主题语义名将随下周组件库发布。</p><span class="badge">已批准</span></div>
        </article>
      </section>
      <div class="surface-demo">抬升表面与卡片表面使用不同令牌，确保深色模式仍有层级。</div>
    </main>
  </body>
</html>`,
      '在 html 或 body 上改 data-theme 即可切换整套亮暗值；文本、边框、状态和抬升表面都随语义令牌变化；原始色值只出现在令牌定义；过渡可被减少动态偏好关闭。',
    ),
  ),

  'programming:CSS3 · 设计 Token、主题与可访问性：颜色、对比度与状态表达': browserLab(
    '颜色、对比与状态',
    '让文本、边界和交互状态满足对比度，并用形状、文字、图标与下划线补充颜色，避免单靠红绿表达。',
    browserTask(
      'html-css-contrast-practice',
      '设计多通道状态徽章',
      '为“成功、警告、错误、处理中”创建徽章；每个状态同时使用文字、形状或边框差异，并保持焦点可见。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>任务状态徽章</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f4ef; color: #222b24; font: 16px/1.6 system-ui, sans-serif; }
      main { width: min(48rem, calc(100% - 2rem)); margin: 3rem auto; padding: 1.5rem; background: white; border: 1px solid #bdc4b9; }
      h1 { margin-top: 0; }
      ul { display: grid; gap: .8rem; margin: 0; padding: 0; list-style: none; }
      li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .7rem; padding: .8rem; border-bottom: 1px solid #d8ddd4; }
      .badge { display: inline-flex; align-items: center; gap: .4rem; min-height: 2rem; padding: .25rem .6rem; border: 2px solid currentColor; font-size: .86rem; font-weight: 800; }
      .badge::before { content: ""; display: inline-block; width: .7rem; height: .7rem; background: currentColor; }
      .success { color: #17623e; background: #e8f6ed; }
      .success::before { border-radius: 50%; }
      .warning { color: #70410a; background: #fff0d0; }
      .warning::before { transform: rotate(45deg); }
      .error { color: #8f261f; background: #ffe8e5; }
      .error::before { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
      .progress { color: #164c74; background: #e7f1fb; }
      .progress::before { border-radius: 50%; background: conic-gradient(currentColor 0 40%, transparent 40% 100%); border: 2px solid currentColor; }
      a { color: #0b5c75; text-underline-offset: .2em; }
      :focus-visible { outline: .22rem solid #c06d1d; outline-offset: .18rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>今日任务</h1>
      <ul>
        <li><span>备份校验</span><span class="badge success">已完成</span></li>
        <li><span>证书续期</span><span class="badge warning">需处理</span></li>
        <li><span>生产发布</span><span class="badge error">已阻止</span></li>
        <li><span>索引重建</span><span class="badge progress">进行中</span></li>
      </ul>
      <p><a href="#top">查看状态说明</a></p>
    </main>
  </body>
</html>`,
      '四种状态都有不同文字与几何标记；把页面转灰度后仍能区分；徽章文字对比达到可读水平；链接与焦点有独立视觉信号。',
    ),
    browserTask(
      'html-css-contrast-apply',
      '修复表单错误与禁用态',
      '创建带格式错误的邮箱字段和禁用按钮；错误说明紧邻字段，禁用态仍可辨认为不可操作，成功提示不依赖绿色。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>账号安全设置</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eef1f6; color: #202b39; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(42rem, calc(100% - 2rem)); margin: 2rem auto; }
      form { padding: clamp(1.2rem, 5vw, 2.5rem); background: white; border-top: .4rem solid #265f8c; }
      h1 { margin-top: 0; }
      .field { display: grid; gap: .35rem; margin: 1.2rem 0; }
      label, legend { font-weight: 800; }
      input { min-height: 2.75rem; padding: .55rem .7rem; border: 2px solid #718196; border-radius: .25rem; font: inherit; }
      .invalid { border-color: #a63328; box-shadow: inset .25rem 0 #a63328; }
      .error { display: flex; gap: .45rem; color: #84261d; font-weight: 700; }
      .error::before { content: "!"; display: grid; place-items: center; flex: 0 0 1.35rem; height: 1.35rem; margin-top: .15rem; border: 2px solid currentColor; border-radius: 50%; line-height: 1; }
      .hint { color: #566577; font-size: .9rem; }
      fieldset { margin: 1.2rem 0; border: 1px solid #9ba8b7; padding: .8rem; }
      .check { display: flex; gap: .6rem; align-items: start; min-height: 2.75rem; }
      input[type="checkbox"] { flex: 0 0 1.25rem; width: 1.25rem; height: 1.25rem; min-height: 0; margin-top: .2rem; }
      .actions { display: flex; flex-wrap: wrap; gap: .7rem; align-items: center; }
      button { min-height: 2.75rem; padding: .55rem 1rem; border: 2px solid #24567d; border-radius: .25rem; font: inherit; font-weight: 800; }
      button[type="submit"] { color: white; background: #24567d; }
      button:disabled { color: #4f5965; background: #d7dce2; border-style: dashed; cursor: not-allowed; }
      .success-note { display: flex; align-items: center; gap: .5rem; padding: .7rem; color: #174d5d; background: #e7f2f4; border-left: .3rem solid #177482; }
      .success-note::before { content: "已"; font-weight: 900; }
      @media (forced-colors: active) {
        .invalid { border: 3px solid CanvasText; }
        .error::before { border-color: CanvasText; }
        .success-note { border: 2px solid CanvasText; }
      }
      :focus-visible { outline: .22rem solid #c77420; outline-offset: .18rem; }
    </style>
  </head>
  <body>
    <main>
      <form action="#saved">
        <h1>账号安全设置</h1>
        <div class="field">
          <label for="security-email">安全邮箱</label>
          <input class="invalid" id="security-email" name="email" type="email" value="ops@example" aria-invalid="true" aria-describedby="email-error">
          <span class="error" id="email-error" role="alert">邮箱缺少完整域名，例如 ops@example.cn。</span>
        </div>
        <fieldset>
          <legend>二次验证</legend>
          <label class="check"><input type="checkbox" name="verify" required> 我已完成身份验证器绑定</label>
          <p class="hint">绑定完成前不能保存这项变更。</p>
        </fieldset>
        <div class="actions">
          <button type="submit" disabled aria-describedby="save-reason">保存安全设置</button>
          <span id="save-reason">需先完成身份验证器绑定。</span>
        </div>
        <p class="success-note">上次登录检查于今天 08:15 完成。</p>
      </form>
      <p id="saved">设置已保存。</p>
    </main>
  </body>
</html>`,
      '错误由边框、感叹号、文本和 aria-describedby 共同表达；禁用按钮有虚线、低饱和颜色和原因说明；成功提示有文字标记；强制色彩模式仍保留边界。',
    ),
  ),

  'programming:CSS3 · 组件样式、动效与隔离：过渡、动画与 prefers-reduced-motion': browserLab(
    '动效与减少动态',
    '用过渡解释状态变化，并在 reduced-motion 下保留即时反馈、移除大幅位移和循环运动。',
    browserTask(
      'html-css-motion-practice',
      '制作可降级的卡片展开',
      '让帮助卡片在 hover/focus-within 时轻微抬升并展开说明；减少动态偏好下只改变边框与颜色，不做位移。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>帮助卡片动效</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; background: #e9edf2; color: #202d39; font: 16px/1.6 system-ui, sans-serif; }
      .help-card {
        width: min(34rem, 100%);
        padding: 1.2rem;
        background: white;
        border: 2px solid #8393a3;
        box-shadow: 0 .3rem .8rem #25394b14;
        transform: translateY(0);
        transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
      }
      .help-card:hover, .help-card:focus-within {
        border-color: #1e6b83;
        box-shadow: 0 .9rem 1.8rem #25394b2b;
        transform: translateY(-.3rem);
      }
      .help-card h1 { margin-top: 0; }
      .more { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .25s ease, opacity .2s ease; }
      .more > div { overflow: hidden; }
      .help-card:hover .more, .help-card:focus-within .more { grid-template-rows: 1fr; opacity: 1; }
      button { min-height: 2.75rem; padding: .5rem .9rem; border: 2px solid #285b70; color: #1d4e61; background: white; font: inherit; font-weight: 750; }
      :focus-visible { outline: .22rem solid #d17d28; outline-offset: .18rem; }
      @media (prefers-reduced-motion: reduce) {
        .help-card, .more { transition: none; }
        .help-card:hover, .help-card:focus-within { transform: none; box-shadow: none; background: #f1f8fa; }
      }
    </style>
  </head>
  <body>
    <section class="help-card">
      <p>存储设置</p>
      <h1>为什么上传被暂停？</h1>
      <p>团队空间已达到当月容量上限。删除回收站文件或升级套餐后可恢复上传。</p>
      <div class="more"><div><p>管理员可在“用量明细”中按项目查看占用，并导出 CSV 交给财务复核。</p></div></div>
      <button type="button">查看用量明细</button>
    </section>
  </body>
</html>`,
      '鼠标悬停或键盘聚焦时卡片轻微抬升、说明展开；减少动态模式下没有位移且说明仍展开；按钮焦点环不受动画影响；内容始终可读。',
    ),
    browserTask(
      'html-css-motion-apply',
      '为同步状态设计渐进反馈',
      '创建“正在同步、已同步、同步失败”三种静态状态；用有限动画突出当前状态，减少动态模式下改用静态文字和边框。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>离线笔记同步状态</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f3f0e7; color: #2d3028; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(52rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { margin-bottom: .4rem; }
      .sync-list { display: grid; gap: .75rem; margin-top: 2rem; }
      .sync-item { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center; padding: 1rem; background: white; border: 1px solid #c9c2b3; }
      .dot { width: 1rem; height: 1rem; border: 3px solid currentColor; border-radius: 50%; color: #2c7a58; }
      .syncing .dot { border-color: #256b8b #a9c8d5 #256b8b #256b8b; animation: spin .9s linear infinite; }
      .failed .dot { color: #9b342b; border-radius: .15rem; transform: rotate(45deg); animation: none; }
      .sync-item h2 { margin: 0; font-size: 1rem; }
      .sync-item p { margin: .2rem 0 0; color: #62675d; font-size: .9rem; }
      .state { min-width: 5.2rem; padding: .25rem .55rem; border: 1px solid currentColor; text-align: center; font-size: .82rem; font-weight: 800; }
      .syncing .state { color: #175b7b; background: #eaf4f9; }
      .done .state { color: #226245; background: #e8f4ed; }
      .failed .state { color: #7d2a22; background: #fbe9e6; }
      button { min-height: 2.75rem; padding: .5rem .8rem; border: 2px solid #6a7368; color: #30372f; background: white; font: inherit; font-weight: 750; }
      :focus-visible { outline: .22rem solid #c86f20; outline-offset: .18rem; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .syncing .dot { animation: none; border-color: #256b8b; box-shadow: 0 0 0 .22rem #c9e2ed; }
        .failed .dot { transform: none; }
        .syncing .state::before { content: "等待 · "; }
      }
    </style>
  </head>
  <body>
    <main>
      <p>离线笔记</p>
      <h1>正在同步 3 条记录</h1>
      <p>关闭页面前请等待同步完成；失败记录保留在本机。</p>
      <section class="sync-list" aria-label="同步状态">
        <article class="sync-item syncing">
          <span class="dot" aria-hidden="true"></span>
          <div><h2>项目复盘提纲</h2><p>已上传 64%，预计还需 8 秒。</p></div>
          <span class="state">同步中</span>
        </article>
        <article class="sync-item done">
          <span class="dot" aria-hidden="true"></span>
          <div><h2>会议行动项</h2><p>今天 09:35 已同步。</p></div>
          <span class="state">已同步</span>
        </article>
        <article class="sync-item failed">
          <span class="dot" aria-hidden="true"></span>
          <div><h2>附件：现场照片</h2><p>网络中断，记录已保存在本机。</p><button type="button">重新同步</button></div>
          <span class="state">失败</span>
        </article>
      </section>
    </main>
  </body>
</html>`,
      '进行中状态有旋转环和文字“同步中”；减少动态模式环停止但加静态光晕并显示“等待”；失败状态使用方形、文字和重试按钮；所有三种状态不依赖颜色单一表达。',
    ),
  ),

  'programming:CSS3 · 设计 Token、主题与可访问性：暗色与高对比主题验收': browserLab(
    '暗色与强制色彩',
    '为亮暗主题重新分配表面、文本和状态色，并在 forced-colors 下使用系统颜色与可见轮廓。',
    browserTask(
      'html-css-dark-contrast-practice',
      '为监控卡适配亮暗主题',
      '使用 prefers-color-scheme 提供默认主题，同时允许 data-theme 显式覆盖；暗色下提升边界和焦点对比。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>服务监控卡</title>
    <style>
      :root {
        color-scheme: light dark;
        --page: #eef1f4;
        --card: #ffffff;
        --text: #1f2b35;
        --muted: #586775;
        --border: #9eabb7;
        --accent: #0d6472;
        --warning: #8a4d08;
      }
      @media (prefers-color-scheme: dark) {
        :root { --page: #111820; --card: #1b2631; --text: #f0f5f8; --muted: #bac7d1; --border: #647787; --accent: #67cbd3; --warning: #ffc16a; }
      }
      :root[data-theme="light"] { --page: #eef1f4; --card: #ffffff; --text: #1f2b35; --muted: #586775; --border: #9eabb7; --accent: #0d6472; --warning: #8a4d08; }
      :root[data-theme="dark"] { --page: #111820; --card: #1b2631; --text: #f0f5f8; --muted: #bac7d1; --border: #647787; --accent: #67cbd3; --warning: #ffc16a; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; color: var(--text); background: var(--page); font: 16px/1.6 system-ui, sans-serif; }
      .monitor { width: min(38rem, 100%); padding: 1.3rem; background: var(--card); border: 2px solid var(--border); box-shadow: 0 1rem 2.5rem #07111a33; }
      header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .6rem; }
      h1 { margin: 0; }
      .muted { color: var(--muted); }
      .metric { margin: 1.2rem 0; padding: 1rem; border-inline-start: .35rem solid var(--accent); background: color-mix(in srgb, var(--card), var(--page) 35%); }
      .metric strong { display: block; font-size: 2.3rem; line-height: 1.1; }
      .alert { display: flex; gap: .6rem; padding: .75rem; color: var(--warning); border: 1px solid currentColor; }
      .alert::before { content: "!"; font-weight: 900; }
      button { min-height: 2.75rem; padding: .55rem .9rem; color: var(--card); background: var(--text); border: 2px solid var(--text); font: inherit; font-weight: 800; }
      :focus-visible { outline: .25rem solid #e69a3c; outline-offset: .2rem; }
      @media (forced-colors: active) {
        .monitor, .metric, .alert { border-color: CanvasText; }
        .metric { background: Canvas; }
        button { color: ButtonText; background: ButtonFace; border-color: ButtonText; }
      }
    </style>
  </head>
  <body>
    <main class="monitor">
      <header><h1>订单服务</h1><span class="muted">最近 5 分钟</span></header>
      <div class="metric"><span>P95 响应时间</span><strong>412 ms</strong><span class="muted">目标低于 300 ms</span></div>
      <p class="alert">延迟连续三次超过阈值，建议暂停发布。</p>
      <button type="button">查看调用链</button>
    </main>
  </body>
</html>`,
      '系统暗色偏好下页面自动使用深色令牌；设置 data-theme=light 可显式覆盖；暗色中文本、边界和焦点仍清晰；强制色彩下按钮和告警轮廓可见。',
    ),
    browserTask(
      'html-css-dark-contrast-apply',
      '验收主题下的表单与图片',
      '创建带说明图、输入框、错误状态和主按钮的设置页；亮暗与 forced-colors 下都要保留边界、焦点和状态文本。',
      `<!doctype html>
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>打印队列设置</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f5f0e6;
        --panel: #fffdf7;
        --text: #2b281f;
        --muted: #635d4e;
        --line: #9d917d;
        --accent: #8f3d24;
        --error: #a02e26;
      }
      :root[data-theme="dark"] { --bg: #171814; --panel: #262820; --text: #f3f0e5; --muted: #c8c2b4; --line: #777c6c; --accent: #f0a061; --error: #ff958a; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.65 system-ui, sans-serif; }
      main { display: grid; grid-template-columns: minmax(15rem, .8fr) minmax(0, 1.2fr); gap: 1.5rem; width: min(64rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      .preview, form { padding: 1.2rem; background: var(--panel); border: 2px solid var(--line); }
      .preview img { display: block; width: 100%; height: auto; background: #d8ccb8; border: 1px solid var(--line); }
      h1 { line-height: 1.2; }
      .field { display: grid; gap: .35rem; margin-block: 1rem; }
      label { font-weight: 800; }
      input { min-height: 2.75rem; padding: .55rem .7rem; color: var(--text); background: var(--panel); border: 2px solid var(--line); font: inherit; }
      input[aria-invalid="true"] { border-color: var(--error); border-inline-start-width: .4rem; }
      .error { color: var(--error); font-weight: 750; }
      .help, .meta { color: var(--muted); }
      .actions { display: flex; flex-wrap: wrap; gap: .7rem; }
      button { min-height: 2.75rem; padding: .55rem 1rem; border: 2px solid var(--accent); color: var(--panel); background: var(--accent); font: inherit; font-weight: 850; }
      :focus-visible { outline: .25rem solid #f0a13d; outline-offset: .18rem; }
      @media (max-width: 46rem) { main { grid-template-columns: 1fr; } }
      @media (forced-colors: active) {
        .preview, form, input, .error { border-color: CanvasText; }
        img { border: 2px solid CanvasText; }
        button { color: ButtonText; background: ButtonFace; border-color: ButtonText; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="preview">
        <h1>打印队列</h1>
        <img width="640" height="420" alt="打印机纸盒打开，旁边放着待装入的空白纸张" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iNDIwIiB2aWV3Qm94PSIwIDAgNjQwIDQyMCI+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSI0MjAiIGZpbGw9IiNkOGNjYjgiLz48cmVjdCB4PSIxNjAiIHk9IjE0MCIgd2lkdGg9IjMyMCIgaGVpZ2h0PSIxODAiIHJ4PSIxNiIgZmlsbD0iIzQxNDc0MSIvPjxyZWN0IHg9IjIwMCIgeT0iMjUwIiB3aWR0aD0iMjQwIiBoZWlnaHQ9IjExMCIgZmlsbD0iI2Y3ZjJkZiIvPjxyZWN0IHg9IjMzNSIgeT0iOTAiIHdpZHRoPSIxNTAiIGhlaWdodD0iOTAiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4=">
        <p class="meta">图片无需联网，在两种主题中都保留纸盒和纸张边界。</p>
      </section>
      <form action="#saved">
        <h2>纸张设置</h2>
        <div class="field">
          <label for="paper-count">预计打印张数</label>
          <input id="paper-count" name="count" type="number" value="0" min="1" aria-invalid="true" aria-describedby="count-error">
          <span class="error" id="count-error">至少输入 1 张；当前 0 张无法开始。</span>
        </div>
        <p class="help">纸张尺寸由打印机自动检测。</p>
        <div class="actions"><button type="submit">开始打印</button></div>
      </form>
    </main>
    <p id="saved">打印任务已提交。</p>
  </body>
</html>`,
      '默认深色主题下图片、输入框和面板边界清楚；错误输入有粗边、文本和 aria-describedby；强制色彩下所有边界由系统色保留；窄屏单列且图片不溢出。',
    ),
  ),

  'programming:CSS3 · 性能、工具链与企业设计系统：样式体积、重复规则与按需加载': browserLab(
    '打印样式与规则复用',
    '合并重复选择器，使用媒体分组减少冗余，并通过 print 媒体让同一文档成为可读、可分页的纸质报告。',
    browserTask(
      'html-css-print-practice',
      '为发票页添加打印规则',
      '页面在屏幕上显示操作栏，在打印时隐藏操作、展开折叠说明、显示金额边框，并控制页面边距。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>服务费用发票</title>
    <style>
      :root { --ink: #1f2931; --muted: #59656d; --line: #9ba8ae; --accent: #1f6b63; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: #eef1f2; font: 15px/1.55 system-ui, sans-serif; }
      .invoice { width: min(50rem, calc(100% - 2rem)); margin: 2rem auto; padding: 2rem; background: white; border: 1px solid var(--line); }
      header, .summary, .parties { display: grid; grid-template-columns: 1fr auto; gap: 1rem; }
      h1, h2 { margin-top: 0; }
      .meta, .note, th { color: var(--muted); }
      table { width: 100%; border-collapse: collapse; margin-block: 1.5rem; }
      th, td { padding: .6rem; border-bottom: 1px solid var(--line); text-align: left; }
      td:last-child, th:last-child { text-align: right; font-variant-numeric: tabular-nums; }
      .summary { padding-top: .8rem; border-top: 2px solid var(--ink); }
      .actions { display: flex; gap: .6rem; justify-content: flex-end; margin-top: 1.2rem; }
      button { min-height: 2.75rem; padding: .5rem .9rem; border: 2px solid #2b5f69; color: #164a53; background: white; font: inherit; font-weight: 750; }
      details { margin-top: 1rem; padding: .7rem; border: 1px dashed var(--line); }
      summary { cursor: pointer; font-weight: 750; }
      :focus-visible { outline: .22rem solid #cf7c27; outline-offset: .15rem; }

      @media (max-width: 34rem) {
        .invoice { padding: 1rem; }
        header, .parties { grid-template-columns: 1fr; }
      }

      @page { size: A4; margin: 16mm; }
      @media print {
        :root { --ink: #000000; --muted: #333333; --line: #777777; --accent: #000000; }
        body { background: white; font-size: 11pt; }
        .invoice { width: auto; margin: 0; padding: 0; border: 0; }
        .actions, .screen-only { display: none !important; }
        details { display: block; border: 0; padding: 0; }
        details > summary { display: none; }
        details::after { content: "备注：付款后 3 个工作日内开具电子回执。"; display: block; margin-top: .5rem; }
        thead { display: table-header-group; }
        tr, .summary { break-inside: avoid; }
        a { color: inherit; text-decoration: none; }
      }
    </style>
  </head>
  <body>
    <main class="invoice">
      <header>
        <div><p>澄明技术服务</p><h1>服务费用发票</h1></div>
        <div class="meta"><p>编号：INV-2026-1124</p><p>日期：<time datetime="2026-11-24">2026-11-24</time></p></div>
      </header>
      <section class="parties">
        <div><h2>客户</h2><p>滨河物流有限公司<br>东港路 18 号</p></div>
        <div><h2>付款信息</h2><p>到期日：2026-12-08<br>币种：人民币</p></div>
      </section>
      <table>
        <thead><tr><th>项目</th><th>数量</th><th>金额</th></tr></thead>
        <tbody>
          <tr><td>设备巡检</td><td>2 次</td><td>¥ 3,600.00</td></tr>
          <tr><td>能耗分析报告</td><td>1 份</td><td>¥ 2,400.00</td></tr>
        </tbody>
      </table>
      <div class="summary"><strong>合计</strong><strong>¥ 6,000.00</strong></div>
      <details>
        <summary>查看付款备注</summary>
        <p>付款后 3 个工作日内开具电子回执。</p>
      </details>
      <div class="actions">
        <button type="button">打印发票</button>
        <button type="button">下载副本</button>
      </div>
    </main>
  </body>
</html>`,
      '打印预览中操作按钮消失；A4 页边距为 16mm；备注内容展开且不重复；表头跨页重复；合计区域不被拆开；屏幕模式仍可正常阅读和操作。',
    ),
    browserTask(
      'html-css-print-apply',
      '合并规则并生成分页报告',
      '为运维月报合并重复标题和卡片规则，屏幕显示导航，打印隐藏导航、展开链接地址并避免卡片被分页截断。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>十一月运维月报</title>
    <style>
      :root { --ink: #202a31; --muted: #5a6871; --line: #aeb8bd; --brand: #1c6070; --soft: #edf4f5; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: #eef0ee; font: 15px/1.65 system-ui, sans-serif; }
      .page { width: min(68rem, 100%); margin: auto; padding: 1rem; }
      nav { display: flex; flex-wrap: wrap; gap: .5rem; padding: 1rem; background: #243c45; color: white; }
      nav a { display: inline-grid; place-items: center; min-height: 2.75rem; padding: .5rem .7rem; color: white; }
      nav a[aria-current="page"] { outline: 2px solid #fff; outline-offset: -4px; }
      .report { padding: clamp(1rem, 4vw, 3rem); background: white; }
      h1, h2, h3 { line-height: 1.25; }
      h1 { font-size: clamp(2.2rem, 7vw, 5rem); margin-bottom: .4rem; }
      h2 { margin-top: 2rem; border-bottom: 2px solid var(--brand); padding-bottom: .3rem; }
      .lede { color: var(--muted); font-size: 1.1rem; }
      .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .8rem; }
      .card { padding: 1rem; background: var(--soft); border: 1px solid var(--line); }
      .card h3 { margin-top: 0; }
      .value { display: block; font-size: 2rem; font-weight: 850; line-height: 1.1; }
      table { width: 100%; border-collapse: collapse; margin-block: 1rem; }
      th, td { padding: .6rem; border-bottom: 1px solid var(--line); text-align: left; }
      th:last-child, td:last-child { text-align: right; }
      .appendix { margin-top: 2rem; padding: 1rem; border: 1px dashed var(--line); }
      footer { margin-top: 2rem; color: var(--muted); font-size: .9rem; }
      :focus-visible { outline: .22rem solid #f0a03b; outline-offset: .15rem; }
      @media (max-width: 48rem) {
        .cards { grid-template-columns: 1fr; }
        nav { position: sticky; top: 0; }
      }
      @page { size: A4; margin: 15mm 14mm; }
      @media print {
        :root { --ink: #000000; --muted: #333333; --line: #777777; --brand: #000000; --soft: #ffffff; }
        body { background: white; font-size: 10.5pt; }
        .page { width: auto; padding: 0; }
        nav, .screen-only { display: none !important; }
        .report { padding: 0; }
        h1 { font-size: 28pt; }
        h2 { break-after: avoid; }
        .cards { grid-template-columns: repeat(3, 1fr); }
        .card, .appendix, tr, .metric-row { break-inside: avoid; }
        thead { display: table-header-group; }
        a[href^="#"]::after { content: " [文内索引：" attr(href) "]"; color: var(--muted); }
        .appendix { display: block; }
        footer { border-top: 1px solid var(--line); padding-top: .5rem; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <nav aria-label="月报章节">
        <a href="#overview" aria-current="page">概览</a>
        <a href="#incidents">事件</a>
        <a href="#appendix">附录</a>
      </nav>
      <main class="report">
        <header>
          <p>基础设施团队</p>
          <h1>十一月运维月报</h1>
          <p class="lede">本报告汇总 1 日至 24 日的可用性、事件和容量变化。</p>
        </header>
        <section id="overview">
          <h2>关键指标</h2>
          <div class="cards">
            <article class="card"><h3>核心服务可用性</h3><span class="value">99.97%</span><p>高于 99.95% 目标。</p></article>
            <article class="card"><h3>P95 延迟</h3><span class="value">188 ms</span><p>较上月下降 22 ms。</p></article>
            <article class="card"><h3>重大事件</h3><span class="value">1</span><p>已在本月完成复盘。</p></article>
          </div>
        </section>
        <section id="incidents">
          <h2>事件与改进</h2>
          <table>
            <thead><tr><th>日期</th><th>事件</th><th>时长</th></tr></thead>
            <tbody>
              <tr><td>11 月 08 日</td><td>缓存节点连接池耗尽</td><td>14 分钟</td></tr>
              <tr><td>11 月 19 日</td><td>日志归档任务延迟</td><td>无用户影响</td></tr>
            </tbody>
          </table>
          <p>改进项：连接池增加饱和告警，归档任务增加积压阈值。</p>
        </section>
        <section class="appendix" id="appendix">
          <h2>附录：数据口径</h2>
          <p>延迟统计排除健康检查，可用性按每分钟探针成功比例计算。</p>
          <p><a href="#overview">返回关键指标</a></p>
        </section>
        <footer>生成时间：2026-11-24 18:20 · 仅限内部使用</footer>
      </main>
    </div>
  </body>
</html>`,
      '打印时导航隐藏、三张指标卡仍同排、章节标题后不立即断页；表格跨页保留表头；文内链接补出目标索引；卡片与表格行不被分页切开。',
    ),
  ),
};
