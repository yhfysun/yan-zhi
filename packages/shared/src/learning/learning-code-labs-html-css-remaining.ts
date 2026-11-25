import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

const BROWSER_SANDBOX = {
  runtimeLabel: 'HTML / CSS 浏览器沙箱',
  installSteps: [
    '代码在隔离的无脚本 iframe 中渲染，不执行 JavaScript，也不访问父页面 DOM。',
    'CSS、图像和字幕必须内嵌在当前 HTML 单文件中，禁止外链、外部字体和网络请求。',
    '分别以 1280px、390px 和 320px 宽度检查结构、计算样式、焦点状态与横向溢出。',
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

export const LEARNING_CODE_LABS_HTML_CSS_REMAINING: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:HTML5 · 浏览器、文档与开发工具：浏览器如何请求和解析 HTML': browserLab(
    '请求、解码与文档树',
    '把 HTTP 响应、字符集、分词和 DOM 建树拆成可观察的证据，识别内容被下载而不是渲染的边界。',
    browserTask(
      'html-css-remaining-fetch-parse-practice',
      '标注一次 HTML 响应',
      '制作一张请求复盘页，明确状态码、Content-Type、字符集、解析阶段和首段可见内容。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>首页响应复盘</title>
    <style>
      :root { --ink: #17212b; --muted: #52606d; --line: #c7d1db; --accent: #0d6b64; --paper: #f5f8fa; }
      * { box-sizing: border-box; }
      body { margin: 0; font: 16px/1.7 system-ui, sans-serif; color: var(--ink); background: var(--paper); }
      main { width: min(64rem, 100%); margin: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { margin: 0; font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1; }
      .summary { max-width: 44rem; color: var(--muted); }
      .trace { display: grid; gap: 1px; margin-top: 2rem; background: var(--line); border: 1px solid var(--line); }
      .trace div { display: grid; gap: .25rem; padding: 1rem; background: white; }
      .trace strong { color: var(--accent); }
      code { overflow-wrap: anywhere; font-size: .95rem; }
      @media (min-width: 44rem) {
        .trace div { grid-template-columns: 10rem 1fr; align-items: baseline; }
      }
    </style>
  </head>
  <body>
    <main>
      <p>工程诊断记录 / 2026-11-24</p>
      <h1>首页响应复盘</h1>
      <p class="summary">地址返回成功不代表浏览器会渲染。逐项核对响应类型、字符集和解析结果。</p>
      <section class="trace" aria-label="请求到文档的检查记录">
        <div><strong>状态行</strong><code>HTTP/1.1 200 OK</code></div>
        <div><strong>内容类型</strong><code>text/html; charset=utf-8</code></div>
        <div><strong>字符集</strong><code>document.characterSet = UTF-8</code></div>
        <div><strong>建树结果</strong><code>html &gt; body &gt; main &gt; h1</code></div>
        <div><strong>首个文本</strong><span>工程诊断记录</span></div>
      </section>
    </main>
  </body>
</html>`,
      '五个检查项都可见；状态与内容类型使用等宽字体；在 320px 下键名和值改为上下排列，长值可换行且页面无横向滚动。',
    ),
    browserTask(
      'html-css-remaining-fetch-parse-apply',
      '定位下载替代渲染的原因',
      '为一个被打包下载的首页写诊断页，比较正确响应、错误 MIME 与缺失字符集三种结果。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MIME 与字符集诊断</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #20262d; background: #eef1f4; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .wrap { width: min(72rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.5rem, 6vw, 4rem); background: #263544; color: #f8fbfd; }
      h1 { max-width: 18ch; margin: 0; font-size: clamp(2rem, 7vw, 4.8rem); line-height: 1.05; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem; margin-block: 1.5rem; }
      article { min-width: 0; padding: 1.25rem; background: white; border-top: .35rem solid #14806f; }
      article:not(:first-child) { border-color: #b54a31; }
      h2 { margin-top: 0; font-size: 1.1rem; }
      dl { margin-bottom: 0; }
      dt { font-weight: 750; }
      dd { margin: .2rem 0 1rem; overflow-wrap: anywhere; }
      .verdict { padding: 1rem; border: 1px solid #9ba8b4; background: #fffdf3; }
      @media print { body { background: white; color: black; } .verdict { border-color: black; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <p>发布前检查</p>
        <h1>为什么首页变成了下载文件？</h1>
      </header>
      <main>
        <section class="cards" aria-label="三种响应结果">
          <article>
            <h2>可正常渲染</h2>
            <dl><dt>Content-Type</dt><dd>text/html; charset=utf-8</dd><dt>结果</dt><dd>进入 HTML 解析器</dd></dl>
          </article>
          <article>
            <h2>触发下载</h2>
            <dl><dt>Content-Type</dt><dd>application/octet-stream</dd><dt>结果</dt><dd>浏览器不建立文档</dd></dl>
          </article>
          <article>
            <h2>中文乱码</h2>
            <dl><dt>Content-Type</dt><dd>text/html，无 charset</dd><dt>结果</dt><dd>解码时序可能错误</dd></dl>
          </article>
        </section>
        <p class="verdict"><strong>修复结论：</strong>先让服务器返回 text/html 和 UTF-8，再检查源码前部的 meta charset。</p>
      </main>
    </div>
  </body>
</html>`,
      '三张卡片分别呈现可渲染、下载和乱码条件；320px 下单列显示，错误类型与正确类型不只靠颜色区分；打印时保留全部文字并去掉背景色。',
    ),
  ),

  'programming:HTML5 · 浏览器、文档与开发工具：DevTools、验证器与最小调试': browserLab(
    '验证器与最小调试证据',
    '用可复现的检查顺序定位文档错误，区分静态验证、实时 DOM 和视觉异常三类证据。',
    browserTask(
      'html-css-remaining-devtools-practice',
      '整理一份最小排查记录',
      '把验证器错误、Elements 结构和 Network 状态放进同一张检查表，并给出修复后的复核动作。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>HTML 最小排查记录</title>
    <style>
      :root { --green: #126b52; --red: #9b342d; --ink: #1b2521; --line: #aebbb5; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: #edf4ef; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(70rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem); }
      h1 { font-size: clamp(2rem, 6vw, 4rem); line-height: 1.05; }
      .checks { display: grid; gap: .75rem; padding: 0; list-style: none; }
      .checks li { display: grid; gap: .35rem; padding: 1rem; background: white; border: 1px solid var(--line); border-inline-start: .4rem solid var(--green); }
      .checks li[data-result="fail"] { border-inline-start-color: var(--red); }
      .label { font-weight: 800; }
      code { overflow-wrap: anywhere; background: #e5ece8; padding: .1rem .3rem; }
      @media (min-width: 42rem) {
        .checks li { grid-template-columns: minmax(10rem, .45fr) 1fr auto; align-items: center; }
      }
    </style>
  </head>
  <body>
    <main>
      <p>调试工单 HTML-42</p>
      <h1>从验证器错误到可重复修复</h1>
      <ol class="checks">
        <li><span class="label">静态结构</span><span>重复 id 已移除</span><strong>通过</strong></li>
        <li data-result="fail"><span class="label">实时 DOM</span><span>图片被错误放进 <code>ul</code></span><strong>未通过</strong></li>
        <li><span class="label">Network</span><span>样式请求返回 200</span><strong>通过</strong></li>
        <li><span class="label">复核</span><span>修正后重新加载并禁用缓存</span><strong>待执行</strong></li>
      </ol>
    </main>
  </body>
</html>`,
      '四项检查按顺序编号；未通过项同时有红色边线和“未通过”文字；320px 下每项纵向排列，代码片段可换行。',
    ),
    browserTask(
      'html-css-remaining-devtools-apply',
      '编写可交接的缺陷报告',
      '为一张语义混乱的活动卡建立缺陷报告，包含实际结构、预期结构、复现步骤和回归检查。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>活动卡结构缺陷报告</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f3f1eb; color: #28261f; font: 16px/1.7 Georgia, "Songti SC", serif; }
      .report { width: min(68rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3.5rem); }
      h1 { margin-bottom: .4rem; font-size: clamp(2.1rem, 7vw, 4.7rem); line-height: 1; }
      .meta { color: #625d50; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; margin-block: 2rem; }
      section { min-width: 0; padding: 1.25rem; border: 1px solid #b8b09e; background: #fffdf8; }
      section h2 { margin-top: 0; font-size: 1.15rem; }
      ol, ul { padding-inline-start: 1.3rem; }
      code { overflow-wrap: anywhere; background: #ece7da; }
      .expected { border-top: .4rem solid #27644c; }
      .actual { border-top: .4rem solid #a43e2c; }
      footer { border-top: 2px solid #28261f; padding-top: 1rem; }
    </style>
  </head>
  <body>
    <article class="report">
      <p>缺陷报告 / HTML-42</p>
      <h1>活动卡使用了错误结构</h1>
      <p class="meta">范围：首页活动卡 · 复现概率：100% · 严重度：中</p>
      <div class="grid">
        <section class="actual">
          <h2>实际结构</h2>
          <code>&lt;div class="action"&gt;立即参加&lt;/div&gt;</code>
          <p>不可键盘聚焦，标题和日期都只是 span。</p>
        </section>
        <section class="expected">
          <h2>预期结构</h2>
          <code>&lt;article&gt;&lt;h2&gt;……&lt;/h2&gt;&lt;time&gt;……&lt;/time&gt;&lt;a&gt;立即参加&lt;/a&gt;&lt;/article&gt;</code>
          <p>标题可被大纲识别，时间可读取，动作使用链接。</p>
        </section>
      </div>
      <section>
        <h2>复现与回归</h2>
        <ol>
          <li>禁用缓存后打开首页，用 Elements 检查活动卡父节点。</li>
          <li>按 Tab，确认“立即参加”获得焦点并可回车激活。</li>
          <li>用标题列表核对活动名称，再以 320px 重测不溢出。</li>
        </ol>
      </section>
      <footer>验证证据：html-validate 报告、Accessibility Tree、320px 截图。</footer>
    </article>
  </body>
</html>`,
      '实际与预期结构并列展示且各有明确标题；复现步骤能直接执行；320px 下两张结构卡单列，长标签和代码不撑破视口。',
    ),
  ),

  'programming:HTML5 · 浏览器、文档与开发工具：第一个语义化多页面站点': browserLab(
    '多页面站点的语义骨架',
    '用页面地标、当前页状态和统一页脚建立可扩展站点，不依赖脚本完成清晰的页面导航。',
    browserTask(
      'html-css-remaining-multipage-practice',
      '搭建三页站点导航',
      '为资料站建立首页、指南和联系页的共享页头、当前页标记、唯一主内容与页脚。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>北岸资料站 · 首页</title>
    <style>
      :root { --navy: #17324d; --aqua: #12766d; --sand: #f2eee4; --ink: #202b33; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--sand); font: 16px/1.7 system-ui, sans-serif; }
      .site-header { padding: 1rem clamp(1rem, 5vw, 4rem); background: var(--navy); color: white; }
      .brand { margin: 0 0 .75rem; font-weight: 850; letter-spacing: .04em; }
      nav ul { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0; padding: 0; list-style: none; }
      nav a { display: inline-flex; min-height: 2.75rem; align-items: center; padding: .5rem .8rem; color: white; }
      nav a[aria-current="page"] { outline: 2px solid #f2c66d; outline-offset: -3px; }
      main { width: min(64rem, 100%); margin: auto; padding: clamp(1.5rem, 6vw, 4rem) 1rem; }
      h1 { max-width: 15ch; font-size: clamp(2.4rem, 9vw, 5.5rem); line-height: 1; color: var(--aqua); }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: 1rem; }
      article { padding: 1rem; background: white; border: 1px solid #c8c2b5; }
      footer { padding: 1.5rem; background: #d9e5df; }
      @media (max-width: 30rem) { nav ul { display: grid; grid-template-columns: 1fr 1fr; } }
    </style>
  </head>
  <body>
    <header class="site-header">
      <p class="brand">北岸研究资料站</p>
      <nav aria-label="站点主要导航">
        <ul>
          <li><a href="#home" aria-current="page">首页</a></li>
          <li><a href="#guide">使用指南</a></li>
          <li><a href="#contact">联系我们</a></li>
        </ul>
      </nav>
    </header>
    <main id="home">
      <p>研究支持中心</p>
      <h1>从可靠资料开始一次调查</h1>
      <p>站点按任务组织内容，页面共享同一导航与信息边界。</p>
      <div class="cards">
        <article><h2>查资料</h2><p>先写问题，再选择目录或索引。</p></article>
        <article><h2>做记录</h2><p>保留来源、访问日期和关键摘录。</p></article>
      </div>
    </main>
    <footer><p>北岸研究资料站 · 内容更新于 2026 年 11 月</p></footer>
  </body>
</html>`,
      'header、nav、main、footer 地标各出现一次；首页链接有 aria-current=page；320px 导航为两列且每项触控高度至少 44px，无横向滚动。',
    ),
    browserTask(
      'html-css-remaining-multipage-apply',
      '设计可扩展项目门户',
      '把项目首页组织为概览、里程碑、交付物和联系区，并为每区提供可读的页内导航。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>河港监测项目门户</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #e9f0f1; color: #183036; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .shell { display: grid; grid-template-columns: minmax(0, 1fr); min-height: 100vh; }
      header { padding: 1.25rem clamp(1rem, 5vw, 3rem); background: #123c46; color: #f7fbfb; }
      .eyebrow { margin: 0; color: #a8d8d0; }
      h1 { margin: .2rem 0 0; font-size: clamp(2rem, 7vw, 4.8rem); line-height: 1.05; }
      nav { background: #f7fbfb; border-bottom: 1px solid #a8babd; }
      nav ul { display: flex; flex-wrap: wrap; margin: 0; padding: .5rem; list-style: none; }
      nav a { display: inline-flex; min-height: 2.75rem; align-items: center; padding: .5rem .7rem; color: #0b5b62; }
      main { width: min(72rem, 100%); margin: auto; padding: 1rem; }
      section { margin-bottom: 1rem; padding: clamp(1rem, 4vw, 2rem); background: white; border-inline-start: .35rem solid #168279; }
      h2 { margin-top: 0; }
      .milestones { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); gap: .75rem; padding: 0; list-style: none; }
      .milestones li { padding: 1rem; background: #e3f1ee; }
      time { font-weight: 800; }
      footer { padding: 1.5rem; text-align: center; background: #cbdadc; }
      @media (min-width: 56rem) { .shell { grid-template-columns: 15rem minmax(0, 1fr); grid-template-rows: auto 1fr auto; } header, footer { grid-column: 1 / -1; } nav { border-right: 1px solid #a8babd; border-bottom: 0; } nav ul { display: grid; gap: .25rem; padding: 1rem; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <p class="eyebrow">项目代号 HBR-7</p>
        <h1>河港监测项目门户</h1>
      </header>
      <nav aria-label="项目章节">
        <ul>
          <li><a href="#overview">项目概览</a></li>
          <li><a href="#milestones">里程碑</a></li>
          <li><a href="#deliverables">交付物</a></li>
          <li><a href="#contact">联系团队</a></li>
        </ul>
      </nav>
      <main>
        <section id="overview"><h2>项目概览</h2><p>为三个河港建立水位、流速和告警数据的统一观测流程。</p></section>
        <section id="milestones">
          <h2>里程碑</h2>
          <ol class="milestones">
            <li><time datetime="2026-12-05">12 月 05 日</time><br>完成传感器点位复核</li>
            <li><time datetime="2026-12-19">12 月 19 日</time><br>完成告警演练</li>
          </ol>
        </section>
        <section id="deliverables"><h2>交付物</h2><p>点位清单、接口契约、运行手册与复盘记录。</p></section>
        <section id="contact"><h2>联系团队</h2><p>工作日 09:00—17:30 通过项目邮箱协调。</p></section>
      </main>
      <footer>河港监测项目组 · 内部协作页</footer>
    </div>
  </body>
</html>`,
      '桌面宽度下导航成为左侧栏，390px 和 320px 下变为顶部可换行列表；四个锚点目标都存在；320px 下时间与说明可读且不产生横向滚动。',
    ),
  ),

  'programming:HTML5 · 语义、结构与企业页面骨架：标题大纲与文档阅读顺序': browserLab(
    '标题大纲与线性阅读',
    '让视觉顺序、DOM 顺序和大纲层级一致，确保关闭样式或使用屏幕阅读器时仍能理解内容。',
    browserTask(
      'html-css-remaining-outline-practice',
      '整理专题文章大纲',
      '把平台迁移专题组织成 h1、两个 h2 和三个 h3，并加入不改变标题层级的视觉编号。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>平台迁移专题大纲</title>
    <style>
      :root { --ink: #252725; --accent: #7b4b1f; --paper: #f6f2e9; --line: #c9bea8; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 17px/1.75 Georgia, "Songti SC", serif; }
      main { width: min(52rem, 100%); margin: 0 auto; padding: clamp(1.25rem, 6vw, 4rem) 1rem; }
      h1 { margin: 0; font-size: clamp(2.3rem, 8vw, 5rem); line-height: 1; }
      .lede { max-width: 38rem; color: #5d5547; }
      section { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line); }
      h2 { display: flex; gap: .7rem; align-items: baseline; font-size: clamp(1.6rem, 5vw, 2.4rem); }
      h2 span { color: var(--accent); font: 800 .7em/1 system-ui, sans-serif; }
      h3 { margin-top: 1.75rem; font-size: 1.15rem; }
      p { max-width: 66ch; }
      @media (max-width: 28rem) { h2 { display: block; } h2 span { display: block; margin-bottom: .25rem; } }
    </style>
  </head>
  <body>
    <main>
      <p>技术专题 / 迁移</p>
      <h1>把旧平台迁往新基础设施</h1>
      <p class="lede">大纲按决策顺序组织：先确认边界，再安排迁移，最后建立回退能力。</p>
      <section>
        <h2><span>01</span>确认现状</h2>
        <h3>盘点接口</h3><p>记录调用方、数据格式和高峰期。</p>
        <h3>确认数据责任</h3><p>区分源系统、复制副本与归档。</p>
      </section>
      <section>
        <h2><span>02</span>执行迁移</h2>
        <h3>灰度与回退</h3><p>每一批流量都带明确观察指标和撤回阈值。</p>
      </section>
    </main>
  </body>
</html>`,
      '大纲只有一个 h1，两个 h2 后不会越过层级直接出现新主题；编号只是视觉 span，不参与可访问名称；320px 下章节号独立成行且没有横向溢出。',
    ),
    browserTask(
      'html-css-remaining-outline-apply',
      '修复视觉优先的阅读顺序',
      '制作一份改造前后对照页，让正文 DOM 顺序、视觉网格和键盘 Tab 顺序都从“问题”走向“行动”。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>阅读顺序改造对照</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #eef0eb; color: #1e2b25; font: 16px/1.7 system-ui, sans-serif; }
      .page { width: min(70rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem); }
      h1 { max-width: 18ch; font-size: clamp(2rem, 7vw, 4.6rem); line-height: 1.02; }
      .compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; }
      article { min-width: 0; display: grid; gap: 1rem; padding: 1.25rem; border: 1px solid #aab8b0; background: white; }
      .bad { border-top: .4rem solid #a33c30; }
      .good { border-top: .4rem solid #176a4d; }
      h2 { margin: 0; font-size: 1.25rem; }
      .visual { padding: .75rem; background: #edf3ef; }
      .visual strong { display: block; }
      a { color: #075e63; text-underline-offset: .18em; }
      a:focus-visible { outline: 3px solid #c26618; outline-offset: 3px; }
      .reading-line { padding-left: 1.2rem; border-left: .25rem solid #789287; }
      @media (max-width: 24rem) { .page { padding-inline: .75rem; } article { padding: 1rem; } }
    </style>
  </head>
  <body>
    <div class="page">
      <p>可访问性审查 / 阅读顺序</p>
      <h1>先读问题，再读行动</h1>
      <div class="compare">
        <article class="bad">
          <h2>改造前</h2>
          <div class="visual"><strong>行动按钮</strong>视觉上在左上</div>
          <p>DOM 却先写说明和免责声明，键盘用户要越过整段内容才能到达主要行动。</p>
          <a href="#fix">查看修复说明</a>
        </article>
        <article class="good">
          <h2>改造后</h2>
          <p>DOM 先给主题和问题，再给可操作链接，最后补充说明。</p>
          <div class="visual"><strong>行动按钮</strong>视觉位置不变，阅读顺序已一致</div>
          <p class="reading-line" id="fix">验证：关闭样式后，先去往链接仍位于说明之后、页脚之前。</p>
        </article>
      </div>
    </div>
  </body>
</html>`,
      '两个 article 各有独立 h2；Tab 时两处链接按 DOM 顺序出现；320px 下对照卡单列，长中文说明与链接文字自然换行且无横向滚动。',
    ),
  ),

  'programming:HTML5 · 语义、结构与企业页面骨架：列表、引用、代码与时间': browserLab(
    '选择正确的内容语义',
    '用列表表达集合与步骤，用引用标明来源，用 code/pre 区分行内与整段代码，用 time 提供机器可读时间。',
    browserTask(
      'html-css-remaining-semantic-content-practice',
      '编写发布变更记录',
      '为一次版本发布组织步骤列表、风险清单、命令代码块、负责人引用和发布时间。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>发布变更记录 2.8.0</title>
    <style>
      :root { --ink: #1f2523; --green: #17624d; --amber: #b46716; --paper: #f5f7f4; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.7 system-ui, sans-serif; }
      article { width: min(64rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem); }
      header { border-bottom: .3rem solid var(--green); }
      h1 { margin-bottom: .3rem; font-size: clamp(2.2rem, 7vw, 4.6rem); line-height: 1; }
      time { color: #56645f; font-weight: 700; }
      .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; margin-block: 1.5rem; }
      section { min-width: 0; padding: 1rem; background: white; border: 1px solid #c3cec8; }
      h2 { font-size: 1.15rem; }
      ol { padding-left: 1.35rem; }
      li + li { margin-top: .5rem; }
      pre { max-width: 100%; overflow-x: auto; padding: 1rem; color: #edf8f2; background: #24312c; line-height: 1.5; }
      code { font-family: Consolas, "Courier New", monospace; }
      blockquote { margin: 1.5rem 0 0; padding: .8rem 1rem; border-left: .3rem solid var(--amber); background: #fff6e7; }
      blockquote cite { display: block; margin-top: .4rem; color: #6f4b1e; font-style: normal; }
    </style>
  </head>
  <body>
    <article>
      <header>
        <p>应用服务 / 生产发布</p>
        <h1>变更记录 2.8.0</h1>
        <time datetime="2026-11-24T20:00:00+08:00">2026 年 11 月 24 日 20:00</time>
      </header>
      <div class="columns">
        <section>
          <h2>发布步骤</h2>
          <ol><li>冻结配置变更。</li><li>创建数据库快照。</li><li>切换到新版本。</li></ol>
        </section>
        <section>
          <h2>风险清单</h2>
          <ul><li>缓存冷启动。</li><li>旧任务格式不兼容。</li></ul>
        </section>
      </div>
      <section>
        <h2>核对命令</h2>
        <pre><code>curl --fail "$BASE_URL/health"
node tools/check-schema.mjs</code></pre>
      </section>
      <blockquote>
        <p>数据库快照完成后再切换流量，失败时保留旧版本进程。</p>
        <cite>发布负责人 · 林岚</cite>
      </blockquote>
    </article>
  </body>
</html>`,
      '发布步骤使用 ol，风险使用 ul，命令位于 pre>code，日期属性是完整 ISO 时间；引用有 cite 来源；320px 下代码块内部滚动而页面不横向溢出。',
    ),
    browserTask(
      'html-css-remaining-semantic-content-apply',
      '制作研究与摘录页',
      '组织一份调研摘要，分别表达论点、数据列表、原文引用、术语定义和研究日期。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>城市夜间照明调研摘要</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #181d23; color: #e9ece9; font: 17px/1.75 Georgia, "Songti SC", serif; }
      main { width: min(70rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.4rem, 6vw, 4rem); background: #28343b; }
      h1 { margin: 0; font-size: clamp(2.2rem, 8vw, 5.2rem); line-height: 1; }
      .content { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      section { min-width: 0; padding: 1.25rem; background: #242b30; border: 1px solid #52616a; }
      h2 { margin-top: 0; color: #9ed8c7; }
      dfn { color: #ffd18b; font-style: normal; }
      blockquote { margin: 1rem 0; padding: 1rem; border-left: .3rem solid #9ed8c7; background: #1d2529; }
      cite { color: #b8c4c7; font-size: .92rem; }
      time { color: #9ed8c7; font-weight: 800; }
      ul { padding-left: 1.3rem; }
      @media print { body { background: white; color: black; } header, section { background: white; border-color: #555; } h2, time, dfn { color: black; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p>城市观察 / 摘要 04</p>
        <h1>夜间照明如何影响步行体验</h1>
        <p>调研日期：<time datetime="2026-11-18">2026 年 11 月 18 日</time></p>
      </header>
      <div class="content">
        <section>
          <h2>观察结论</h2>
          <p><dfn>眩光</dfn>指光源亮度相对周围环境过高，导致不适或辨识下降。</p>
          <ul><li>转角处照度不均。</li><li>广告屏与路灯色温冲突。</li><li>树冠遮挡形成暗区。</li></ul>
        </section>
        <section>
          <h2>实地原话</h2>
          <blockquote>
            <p>“走到十字路口时，我能看到灯，但看不清对面来人的脸。”</p>
            <cite>夜间步行访谈 · 参与者 07</cite>
          </blockquote>
          <p>下一轮调研将记录同样点位在晴、雨两种天气下的照度。</p>
        </section>
      </div>
    </main>
  </body>
</html>`,
      '术语使用 dfn，访谈内容使用 blockquote 和 cite，调研日期使用 time；两栏在 320px 下变单栏；打印时文字转为黑底白纸且所有内容仍可见。',
    ),
  ),

  'programming:HTML5 · 表单、输入与验证：原生约束验证与错误提示': browserLab(
    '原生约束与错误恢复',
    '把 required、type、minlength、pattern 和 aria-describedby 组合成可理解的表单错误状态。',
    browserTask(
      'html-css-remaining-validation-practice',
      '构建账户注册约束',
      '为用户名、邮箱和密码设置原生约束，展示错误摘要、字段级说明和成功状态。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>账户注册</title>
    <style>
      :root { --ink: #202725; --brand: #17645c; --error: #9f342f; --line: #aeb9b5; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; color: var(--ink); background: #eaf2ee; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(42rem, 100%); margin: auto; padding: clamp(1rem, 6vw, 3rem) 1rem; }
      h1 { font-size: clamp(2.1rem, 8vw, 4.2rem); line-height: 1; }
      .notice { padding: 1rem; border: 1px solid #c9847d; background: #fff2f0; color: #70231e; }
      form { display: grid; gap: 1.2rem; margin-top: 1.25rem; padding: clamp(1rem, 4vw, 2rem); background: white; border: 1px solid var(--line); }
      .field { min-width: 0; }
      label { display: block; font-weight: 800; }
      .hint, .error { display: block; margin-top: .3rem; font-size: .9rem; }
      .hint { color: #596662; }
      .error { color: var(--error); font-weight: 700; }
      input { width: 100%; min-height: 2.75rem; margin-top: .35rem; padding: .55rem .7rem; border: 2px solid var(--line); border-radius: 0; color: inherit; background: white; font: inherit; }
      input:focus-visible { outline: 3px solid #d98a29; outline-offset: 2px; }
      input[aria-invalid="true"] { border-color: var(--error); }
      button { min-height: 2.9rem; border: 0; padding: .6rem 1rem; color: white; background: var(--brand); font: 800 1rem/1 system-ui, sans-serif; cursor: pointer; }
      .success { color: #105b43; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <p>账户中心</p>
      <h1>创建工程协作账户</h1>
      <div class="notice" role="alert">
        <strong>提交前请修正 1 项：</strong>
        邮箱格式不完整。
      </div>
      <form action="#created" method="post">
        <div class="field">
          <label for="username">用户名</label>
          <span class="hint" id="username-hint">4—20 个字符，可使用中文与字母。</span>
          <input id="username" name="username" type="text" minlength="4" maxlength="20" autocomplete="username" required aria-describedby="username-hint">
        </div>
        <div class="field">
          <label for="email">工作邮箱</label>
          <span class="hint" id="email-hint">用于接收登录验证。</span>
          <input id="email" name="email" type="email" value="lin@" autocomplete="email" required aria-invalid="true" aria-describedby="email-hint email-error">
          <span class="error" id="email-error">请输入完整邮箱，例如 lin@example.com。</span>
        </div>
        <div class="field">
          <label for="password">密码</label>
          <span class="hint" id="password-hint">至少 10 个字符。</span>
          <input id="password" name="password" type="password" minlength="10" autocomplete="new-password" required aria-describedby="password-hint">
        </div>
        <button type="submit">创建账户</button>
        <p class="success" id="created">已有账户可返回登录。</p>
      </form>
    </main>
  </body>
</html>`,
      '邮箱字段有 aria-invalid=true 且通过 aria-describedby 同时关联提示与错误；错误使用文字和边框双重表达；Tab 焦点轮廓清晰，320px 下所有控件保持单列。',
    ),
    browserTask(
      'html-css-remaining-validation-apply',
      '设计活动报名校验',
      '为姓名、手机号、参加日期和条款确认设计约束，错误摘要应指向具体字段。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>工作坊报名表</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f1ede5; color: #29261f; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(66rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.5rem, 5vw, 3rem); background: #423a2b; color: #fffaf1; }
      h1 { margin: .25rem 0; font-size: clamp(2rem, 7vw, 4rem); line-height: 1; }
      .layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      aside, form { min-width: 0; padding: 1.25rem; background: #fffaf2; border: 1px solid #bfb29d; }
      aside h2, form h2 { margin-top: 0; }
      .error-summary { padding: 1rem; border-left: .35rem solid #a33d2f; background: #fff0ed; }
      .field { margin-top: 1rem; }
      label, legend { font-weight: 800; }
      input { display: block; width: 100%; min-height: 2.75rem; margin-top: .3rem; padding: .5rem .65rem; border: 2px solid #a79880; border-radius: 0; background: white; font: inherit; }
      .invalid input { border-color: #a33d2f; }
      .message { display: block; margin-top: .25rem; color: #7d281f; font-weight: 700; }
      fieldset { margin: 1rem 0 0; padding: .75rem; border: 1px solid #a79880; }
      .choice { display: flex; min-height: 2.75rem; align-items: center; gap: .6rem; }
      .choice input { width: 1.25rem; min-height: 1.25rem; margin: 0; }
      button { min-height: 2.9rem; margin-top: 1rem; border: 0; padding: .65rem 1rem; color: white; background: #7b4c18; font: 800 1rem/1 system-ui, sans-serif; }
      :focus-visible { outline: 3px solid #14736b; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>社区教育中心</p>
        <h1>木工基础工作坊报名</h1>
        <p>提交前请核对联系方式和参加日期。</p>
      </header>
      <div class="layout">
        <aside>
          <h2>活动信息</h2>
          <p>12 月 6 日 13:30 开始，工具与护具由场地提供。</p>
          <p>名额有限，取消请提前一天告知。</p>
        </aside>
        <form action="#registration-result" method="post" novalidate>
          <h2>报名资料</h2>
          <div class="error-summary" role="alert">
            <strong>无法提交：</strong>请检查手机号并确认条款。
          </div>
          <div class="field">
            <label for="name">姓名</label>
            <input id="name" name="name" autocomplete="name" minlength="2" required>
          </div>
          <div class="field invalid">
            <label for="phone">手机号</label>
            <input id="phone" name="phone" type="tel" value="1381234" autocomplete="tel" pattern="1[3-9][0-9]{9}" required aria-invalid="true" aria-describedby="phone-error">
            <span class="message" id="phone-error">请输入 11 位中国大陆手机号。</span>
          </div>
          <div class="field">
            <label for="date">参加日期</label>
            <input id="date" name="date" type="date" value="2026-12-06" min="2026-12-06" required>
          </div>
          <fieldset>
            <legend>确认事项</legend>
            <label class="choice"><input type="checkbox" name="terms" required> 我已阅读安全须知</label>
          </fieldset>
          <button type="submit">确认报名</button>
          <p id="registration-result" role="status">提交后将在此显示报名编号。</p>
        </form>
      </div>
    </div>
  </body>
</html>`,
      '错误摘要包含文字数量与具体修复目标；手机号错误关联字段；日期有 min；条款使用 checkbox；320px 下信息与表单单列，所有可点击目标至少 44px。',
    ),
  ),

  'programming:HTML5 · 表单、输入与验证：fieldset、legend 与分组语义': browserLab(
    '表单分组与提交状态',
    '用 fieldset/legend 表达相关问题，并把提交、取消、加载和防重复提交状态做成可读界面。',
    browserTask(
      'html-css-remaining-fieldset-practice',
      '分组收货与账单信息',
      '把联系人、收货地址和账单地址分成三组，并通过 legend 与说明文字表明每组目的。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>订单配送信息</title>
    <style>
      :root { --ink: #1e2c34; --brand: #1b6572; --line: #a9bbc1; --soft: #edf5f6; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: #e7eef0; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(58rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4rem); line-height: 1; }
      form { display: grid; gap: 1rem; }
      fieldset { min-width: 0; margin: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      legend { padding: 0 .4rem; color: var(--brand); font-weight: 850; }
      .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: .9rem; }
      .field { min-width: 0; }
      label { display: block; font-weight: 700; }
      input, select { width: 100%; min-height: 2.75rem; margin-top: .3rem; padding: .5rem .6rem; border: 1px solid #879ba1; border-radius: 0; background: white; font: inherit; }
      .hint { display: block; color: #576a70; font-size: .9rem; }
      .actions { display: flex; flex-wrap: wrap; gap: .75rem; }
      button { min-height: 2.9rem; padding: .6rem 1rem; border: 2px solid var(--brand); font: 800 1rem/1 system-ui, sans-serif; }
      .primary { color: white; background: var(--brand); }
      .secondary { color: var(--brand); background: white; }
      :focus-visible { outline: 3px solid #c26a1b; outline-offset: 2px; }
      @media (max-width: 25rem) { .actions button { width: 100%; } }
    </style>
  </head>
  <body>
    <main>
      <p>订单 #A-1842</p>
      <h1>确认配送信息</h1>
      <form action="#saved" method="post">
        <fieldset>
          <legend>联系人</legend>
          <div class="fields">
            <div class="field"><label for="buyer">姓名</label><input id="buyer" name="buyer" autocomplete="name" required></div>
            <div class="field"><label for="buyer-phone">手机号</label><input id="buyer-phone" name="buyer-phone" type="tel" autocomplete="tel" required></div>
          </div>
        </fieldset>
        <fieldset>
          <legend>收货地址</legend>
          <div class="fields">
            <div class="field"><label for="ship-city">城市</label><input id="ship-city" name="ship-city" autocomplete="address-level2" required></div>
            <div class="field"><label for="ship-address">详细地址</label><input id="ship-address" name="ship-address" autocomplete="street-address" required></div>
          </div>
        </fieldset>
        <fieldset>
          <legend>账单地址</legend>
          <label for="billing-mode">处理方式</label>
          <select id="billing-mode" name="billing-mode"><option>与收货地址相同</option><option>使用其他地址</option></select>
          <span class="hint">选择“其他地址”后再填写账单城市和街道。</span>
        </fieldset>
        <div class="actions">
          <button class="primary" type="submit">保存并继续</button>
          <button class="secondary" type="reset">恢复初始值</button>
        </div>
        <p id="saved" role="status">保存后将返回订单确认页。</p>
      </form>
    </main>
  </body>
</html>`,
      '每个 fieldset 都有唯一的 legend；相关字段在组内形成网格；320px 下按钮占满可用宽度；焦点轮廓在白色和深色按钮上都清晰。',
    ),
    browserTask(
      'html-css-remaining-fieldset-apply',
      '设计带进度的故障报告',
      '把事故报告分成基本信息、影响范围和处置记录三组，并明确提交中、已禁用和可取消状态。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>事故报告提交</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f0f1ed; color: #242923; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(64rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #29372f; color: #f4f8f4; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4rem); line-height: 1; }
      .progress { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0; padding: 0; list-style: none; }
      .progress li { padding: .3rem .6rem; border: 1px solid #9eb1a4; }
      .progress [aria-current="step"] { background: #dff0e4; color: #174c2e; font-weight: 800; }
      form { display: grid; gap: 1rem; margin-top: 1rem; }
      fieldset { min-width: 0; margin: 0; padding: 1rem; background: white; border: 1px solid #aab5ad; }
      legend { padding: 0 .4rem; font-weight: 850; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: .8rem; }
      label { display: block; font-weight: 700; }
      input, textarea { width: 100%; min-height: 2.75rem; margin-top: .3rem; padding: .55rem .65rem; border: 1px solid #87958b; border-radius: 0; background: #fbfcfb; font: inherit; }
      textarea { min-height: 7rem; resize: vertical; }
      .status { padding: .9rem 1rem; border-left: .35rem solid #b06a17; background: #fff5e5; }
      .actions { display: flex; flex-wrap: wrap; gap: .75rem; }
      button { min-height: 2.9rem; padding: .6rem 1rem; border: 2px solid #315d45; font: 800 1rem/1 system-ui, sans-serif; }
      button[aria-disabled="true"] { cursor: not-allowed; opacity: .65; }
      .submit { color: white; background: #315d45; }
      .cancel { color: #315d45; background: white; }
      :focus-visible { outline: 3px solid #be6a18; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>事件 INC-2041</p>
        <h1>提交故障处置报告</h1>
        <ol class="progress" aria-label="报告完成进度">
          <li>基本信息</li>
          <li aria-current="step">处置记录</li>
          <li>复核</li>
        </ol>
      </header>
      <form action="#queued" method="post">
        <fieldset>
          <legend>基本信息</legend>
          <div class="grid">
            <div><label for="incident-title">事件标题</label><input id="incident-title" value="订单查询延迟升高" required></div>
            <div><label for="started-at">发现时间</label><input id="started-at" type="datetime-local" value="2026-11-24T19:12" required></div>
          </div>
        </fieldset>
        <fieldset>
          <legend>影响范围</legend>
          <div><label for="impact">受影响服务与用户范围</label><textarea id="impact">结算页查询 P95 延迟升高，约 12% 用户受到影响。</textarea></div>
        </fieldset>
        <fieldset>
          <legend>处置记录</legend>
          <div><label for="actions-taken">已执行动作</label><textarea id="actions-taken">回滚索引变更，恢复旧查询计划，并扩大只读副本连接池。</textarea></div>
        </fieldset>
        <p class="status" role="status" aria-live="polite"><strong>正在保存：</strong>请勿重复提交。上一状态已完成。</p>
        <div class="actions">
          <button class="submit" type="submit" aria-disabled="true">保存中…</button>
          <button class="cancel" type="button">取消编辑</button>
        </div>
        <p id="queued">若网络中断，页面会保留当前输入并提供重新提交入口。</p>
      </form>
    </div>
  </body>
</html>`,
      '进度列表用 aria-current=step 标出当前阶段；fieldset 三组完整；保存中按钮有 aria-disabled 和文字状态；取消按钮仍可聚焦，320px 下按钮可换行不裁切。',
    ),
  ),

  'programming:HTML5 · 媒体、表格与内容表达：媒体与富内容企业页面': browserLab(
    '媒体、表格与内嵌资源',
    '在无网络请求的前提下组织图像、音视频替代内容、数据表格和图文说明，让内容加载失败时仍可理解。',
    browserTask(
      'html-css-remaining-media-practice',
      '制作产品演示内容区',
      '为设备演示页加入内嵌图像、视频字幕说明、参数表和播放器不可用时的文字替代。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>空气监测仪产品演示</title>
    <style>
      :root { --ink: #1d2927; --green: #1b6a57; --line: #b7c4bf; --paper: #f0f6f3; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(72rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { max-width: 20ch; font-size: clamp(2.2rem, 8vw, 5rem); line-height: 1; }
      .layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 1rem; }
      figure { min-width: 0; margin: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      figure > svg { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; }
      figcaption { margin-top: .75rem; color: #52625c; }
      video { display: block; width: 100%; height: auto; background: #1d2927; }
      .table-wrap { max-width: 100%; overflow-x: auto; margin-top: 1rem; border: 1px solid var(--line); }
      table { width: 100%; border-collapse: collapse; background: white; }
      caption { padding: .8rem; text-align: left; font-weight: 850; }
      th, td { padding: .7rem; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
      :focus-visible { outline: 3px solid #bd6a17; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <p>环境设备 / AQ-12</p>
      <h1>在真实空间中观察空气质量</h1>
      <div class="layout">
        <figure>
          <svg viewBox="0 0 800 600" role="img" aria-labelledby="meter-title meter-desc">
            <title id="meter-title">空气监测仪读数示意</title>
            <desc id="meter-desc">灰色设备正面显示颗粒物读数 12 和绿色状态灯。</desc>
            <rect width="800" height="600" fill="#dfeae5"/>
            <rect x="200" y="80" width="400" height="440" rx="28" fill="#434f4c"/>
            <rect x="250" y="140" width="300" height="180" rx="12" fill="#dce8e3"/>
            <text x="400" y="245" text-anchor="middle" font-size="72" fill="#1f3f36">12</text>
            <circle cx="400" cy="430" r="32" fill="#5bbf88"/>
          </svg>
          <figcaption>颗粒物读数与状态灯同时显示，避免只用颜色判断空气状态。</figcaption>
        </figure>
        <section>
          <h2>演示视频</h2>
          <video controls width="640" height="360" aria-describedby="video-description">
            您的浏览器不支持视频播放。可阅读下方说明。
          </video>
          <p id="video-description">视频内容：开机、放置一米高的平台、等待两分钟，再读取三次平均值。</p>
          <p>字幕应覆盖读数变化和操作顺序；没有视频文件时，文字步骤仍是完整替代内容。</p>
        </section>
      </div>
      <div class="table-wrap">
        <table>
          <caption>AQ-12 测量范围</caption>
          <thead><tr><th scope="col">指标</th><th scope="col">范围</th><th scope="col">分辨率</th></tr></thead>
          <tbody>
            <tr><th scope="row">PM2.5</th><td>0—500 μg/m³</td><td>1 μg/m³</td></tr>
            <tr><th scope="row">温度</th><td>-10—50 ℃</td><td>0.1 ℃</td></tr>
          </tbody>
        </table>
      </div>
    </main>
  </body>
</html>`,
      '图像由 data URL 内嵌且 alt 描述可见画面；视频有文字替代说明；表格 caption 和行列 th 关系明确；320px 下仅表格容器内部横向滚动，页面本身无横向溢出。',
    ),
    browserTask(
      'html-css-remaining-media-apply',
      '编写审计数据与媒体摘要',
      '为数据中心巡检页加入设备图、可下载字幕说明、分区统计表、审计时间与失败兜底文字。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>数据中心巡检摘要</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #e8efec; background: #17211f; font: 16px/1.65 Consolas, "Microsoft YaHei", monospace; }
      .page { width: min(76rem, 100%); margin: auto; padding: 1rem; }
      header { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 1rem; align-items: end; padding: 1.25rem; background: #24322e; border-bottom: .3rem solid #62c49c; }
      h1 { margin: 0; font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1; }
      .status { color: #a9e7ca; }
      .media { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      figure, section { min-width: 0; margin: 0; padding: 1rem; background: #202b28; border: 1px solid #52655e; }
      figure > svg { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; }
      figcaption { margin-top: .65rem; color: #b7c7c1; }
      audio { width: 100%; margin-block: .7rem; }
      .audio-fallback { padding: .7rem; border-left: .25rem solid #e1a554; background: #302b20; }
      .table-wrap { max-width: 100%; overflow-x: auto; margin-top: 1rem; border: 1px solid #52655e; }
      table { width: 100%; border-collapse: collapse; background: #202b28; }
      caption { padding: .8rem; text-align: left; color: #a9e7ca; font-weight: 800; }
      th, td { padding: .7rem; border-bottom: 1px solid #52655e; text-align: left; }
      tfoot { font-weight: 800; }
      time { color: #a9e7ca; }
      @media print { body { color: black; background: white; } header, figure, section, table { background: white; border-color: #666; } .audio-fallback { border-color: #666; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <div><p>巡检记录 / DC-07</p><h1>西区机房温度复核</h1></div>
        <p class="status">状态：已完成 · <time datetime="2026-11-24T18:40:00+08:00">18:40</time></p>
      </header>
      <div class="media">
        <figure>
          <svg viewBox="0 0 900 600" role="img" aria-labelledby="rack-title rack-desc">
            <title id="rack-title">机房温度检查示意</title>
            <desc id="rack-desc">两排服务器机柜之间显示温度 22 摄氏度。</desc>
            <rect width="900" height="600" fill="#26302e"/>
            <g fill="#495753"><rect x="80" y="80" width="260" height="440"/><rect x="560" y="80" width="260" height="440"/></g>
            <rect x="350" y="210" width="200" height="150" rx="12" fill="#245770"/>
            <text x="450" y="315" text-anchor="middle" font-size="72" fill="white">22</text>
          </svg>
          <figcaption>冷通道中部温度稳定在 22 ℃，机柜门保持关闭。</figcaption>
        </figure>
        <section>
          <h2>语音复核记录</h2>
          <audio controls aria-describedby="audio-note">浏览器不支持音频，请阅读文字记录。</audio>
          <p id="audio-note">文字记录：东侧回风口温度 23.4 ℃，传感器序列号 TS-184。</p>
          <p class="audio-fallback">若音频不可用，本段文字保留测量值、位置和传感器编号。</p>
        </section>
      </div>
      <div class="table-wrap">
        <table>
          <caption>机房分区温度汇总</caption>
          <thead><tr><th scope="col">分区</th><th scope="col">进风温度</th><th scope="col">回风温度</th></tr></thead>
          <tbody><tr><th scope="row">西区</th><td>21.8 ℃</td><td>28.4 ℃</td></tr><tr><th scope="row">东区</th><td>22.3 ℃</td><td>29.1 ℃</td></tr></tbody>
          <tfoot><tr><th scope="row">最高回风</th><td colspan="2">29.1 ℃ · 未超过阈值</td></tr></tfoot>
        </table>
      </div>
    </div>
  </body>
</html>`,
      '图片和音频都有无需联网的替代文字；表格含 caption、列标题、行标题和 tfoot；320px 下媒体卡单列、表格内部滚动，打印时转为白底且数据完整。',
    ),
  ),

  'programming:HTML5 · 可访问性、SEO 与国际化：ARIA 的角色、名称和状态': browserLab(
    '原生语义优先的 ARIA',
    '只在原生元素不足时补充角色、可访问名称和状态，避免重复朗读、失效状态和虚假控件。',
    browserTask(
      'html-css-remaining-aria-practice',
      '设计状态与说明关系',
      '制作任务状态看板，使用原生标题、按钮和 details，并用 aria-labelledby、aria-describedby 与 role=status 补充上下文。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>发布任务状态</title>
    <style>
      :root { --ink: #1c2925; --green: #1d684e; --line: #aebcb5; --amber: #9a611b; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: #edf3ef; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(66rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1.04; }
      .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; }
      article { min-width: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      article h2 { margin-top: 0; }
      .status { padding: .6rem .8rem; border-left: .3rem solid var(--green); background: #e6f3eb; }
      .status.attention { border-color: var(--amber); background: #fff1d9; }
      button, summary { min-height: 2.75rem; font: inherit; }
      button { border: 2px solid var(--green); padding: .5rem .8rem; color: white; background: var(--green); }
      details { border-top: 1px solid var(--line); padding-top: .75rem; }
      summary { display: flex; align-items: center; cursor: pointer; font-weight: 800; }
      .help { margin-top: .7rem; color: #52625c; }
      :focus-visible { outline: 3px solid #c26918; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <p>运营控制台</p>
      <h1 id="page-title">发布任务状态</h1>
      <p id="page-help">每个任务使用原生控件与文字状态，不依赖颜色判断。</p>
      <section class="board" aria-labelledby="page-title" aria-describedby="page-help">
        <article>
          <h2 id="task-a">准备发布清单</h2>
          <p class="status" role="status">已完成：18 项检查全部通过。</p>
          <button type="button" aria-describedby="task-a">查看记录</button>
        </article>
        <article>
          <h2 id="task-b">复核数据库迁移</h2>
          <p class="status attention" role="status">需要注意：仍需确认回滚脚本。</p>
          <details>
            <summary>展开失败条件</summary>
            <p class="help">若旧表仍有写入，停止切换并恢复只读模式。</p>
          </details>
        </article>
      </section>
    </main>
  </body>
</html>`,
      '主区域名称来自 page-title；按钮通过 aria-describedby 关联任务；两个 role=status 都含明确文字；details 可用 Enter 或空格展开；320px 下卡片单列且焦点轮廓不被裁切。',
    ),
    browserTask(
      'html-css-remaining-aria-apply',
      '修复虚假自定义控件',
      '对照错误与正确方案，保留原生可聚焦行为，并用 aria-current、aria-labelledby 和 aria-describedby 表达真实界面关系。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ARIA 改造对照</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f1eee7; color: #26251f; font: 16px/1.7 Georgia, "Songti SC", serif; }
      .page { width: min(70rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #353126; color: #fffaf0; }
      h1 { margin: 0; font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1; }
      .compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      article { min-width: 0; padding: 1rem; background: #fffdf8; border: 1px solid #bdb3a1; }
      .wrong { border-top: .4rem solid #9e3d31; }
      .right { border-top: .4rem solid #26644c; }
      h2 { margin-top: 0; }
      .fake-control { margin-block: 1rem; padding: .7rem; color: white; background: #9e3d31; }
      a { display: inline-flex; min-height: 2.75rem; align-items: center; padding: .5rem .8rem; color: white; background: #26644c; }
      nav ul { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0; padding: .5rem; list-style: none; background: #dde8e1; }
      nav a { background: transparent; color: #174c39; }
      nav a[aria-current="page"] { outline: 2px solid #174c39; outline-offset: -3px; font-weight: 800; }
      .note { margin-top: 1rem; padding: .8rem; border-left: .3rem solid #a66a1e; background: #fff1d9; }
      :focus-visible { outline: 3px solid #d5761c; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>组件审查 / 导航</p>
        <h1>ARIA 不是替脚本补洞</h1>
      </header>
      <div class="compare">
        <article class="wrong">
          <h2>错误：div 假装按钮</h2>
          <p id="fake-note">这个方块没有键盘行为，也没有原生按钮角色。</p>
          <div class="fake-control" aria-describedby="fake-note">继续</div>
        </article>
        <article class="right">
          <h2>正确：使用原生链接</h2>
          <p>需要导航时使用 a 和真实 href，获得焦点与激活行为。</p>
          <a href="#details" aria-describedby="link-note">查看迁移详情</a>
          <p class="note" id="link-note">链接名称说明去向，不依赖周围文字。</p>
        </article>
      </div>
      <nav aria-labelledby="nav-title">
        <h2 id="nav-title">项目导航</h2>
        <ul>
          <li><a href="#overview" aria-current="page">概览</a></li>
          <li><a href="#details">迁移详情</a></li>
        </ul>
      </nav>
      <section id="details"><h2>迁移详情</h2><p>原生控件减少状态同步错误，也保留浏览器与辅助技术的默认行为。</p></section>
      <section id="overview"><h2>概览</h2><p>当前处于改造前的检查阶段。</p></section>
    </div>
  </body>
</html>`,
      '错误示例没有 Tab 焦点，正确链接可以 Tab 并回车到 details；当前导航项有 aria-current=page；320px 下对照卡单列，证据文字与链接均不重叠。',
    ),
  ),

  'programming:HTML5 · 可访问性、SEO 与国际化：SEO、canonical 与 robots': browserLab(
    '索引控制与规范地址',
    '用 title、description、canonical、robots 和结构化标题表达页面身份，区分搜索摘要、索引控制与用户可见内容。',
    browserTask(
      'html-css-remaining-seo-practice',
      '建立产品文档元数据',
      '为一个设备安装指南写唯一标题、摘要、robots 指令和规范地址，并让可见标题与元数据一致。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="AQ-12 空气监测仪的安装、供电和联网前检查指南。">
    <meta name="robots" content="index, follow, max-snippet:-1">
    <link rel="canonical" href="/docs/aq12/install">
    <title>AQ-12 安装指南 · 环境设备文档</title>
    <style>
      :root { --ink: #1f2b27; --green: #1c6b51; --paper: #f4f6f2; --line: #b4c1b9; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.7 system-ui, sans-serif; }
      main { width: min(64rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      header { padding: clamp(1.5rem, 5vw, 3rem); background: #244034; color: #f8fcf9; }
      h1 { max-width: 22ch; margin: 0; font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1.04; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: .75rem; margin-top: 1rem; }
      .meta div { min-width: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      dt { color: #5b6a62; font-size: .88rem; font-weight: 800; }
      dd { margin: .2rem 0 0; overflow-wrap: anywhere; }
      code { font-family: Consolas, monospace; }
      @media print { body, header { color: black; background: white; } .meta div { border-color: #555; } }
    </style>
  </head>
  <body>
    <header>
      <p>环境设备文档</p>
      <h1>AQ-12 安装指南</h1>
      <p>先完成通风位置确认，再接通电源并检查联网状态。</p>
    </header>
    <main>
      <h2>搜索与索引信息</h2>
      <dl class="meta">
        <div><dt>页面标题</dt><dd>AQ-12 安装指南 · 环境设备文档</dd></div>
        <div><dt>规范地址</dt><dd><code>/docs/aq12/install</code></dd></div>
        <div><dt>索引策略</dt><dd><code>index, follow, max-snippet:-1</code></dd></div>
      </dl>
      <section><h2>安装前检查</h2><p>设备离墙面至少 20 厘米，并避开直吹空调出风口。</p></section>
    </main>
  </body>
</html>`,
      'head 中存在唯一 title、description、robots 和 canonical；页面可见 h1 与 title 主体一致；320px 下元数据卡单列，长 canonical 值可在卡片内换行。',
    ),
    browserTask(
      'html-css-remaining-seo-apply',
      '审计重复页面与索引策略',
      '为多语言活动页制作索引审计表，明确 canonical、hreflang、noindex 与页面可见内容之间的关系。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="城市阅读节活动页的规范地址、语言替代页与索引策略审计。">
    <meta name="robots" content="noindex, follow">
    <link rel="canonical" href="/events/reading-festival">
    <title>城市阅读节索引审计</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #251f2b; background: #f2eef5; font: 16px/1.7 "Microsoft YaHei", sans-serif; }
      .page { width: min(70rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #49355a; color: #fbf8ff; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .warning { margin-top: 1rem; padding: 1rem; border-left: .35rem solid #b76a18; background: #fff4df; }
      .table-wrap { max-width: 100%; overflow-x: auto; margin-top: 1rem; border: 1px solid #b6a6bf; }
      table { width: 100%; border-collapse: collapse; background: white; }
      caption { padding: .8rem; text-align: left; font-weight: 850; }
      th, td { padding: .75rem; border-bottom: 1px solid #cbbfd1; text-align: left; }
      th { background: #e8dfec; }
      code { overflow-wrap: anywhere; font-family: Consolas, monospace; }
      .decision { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: .75rem; margin-top: 1rem; }
      .decision div { padding: 1rem; background: white; border: 1px solid #b6a6bf; }
      @media (max-width: 30rem) { th, td { white-space: normal; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>搜索发布检查</p>
        <h1>城市阅读节索引审计</h1>
        <p>规范版本可被索引，本审计副本明确排除索引。</p>
      </header>
      <p class="warning"><strong>判断：</strong>当前页面保留链接价值，但不应与主活动页争夺搜索结果。</p>
      <div class="table-wrap">
        <table>
          <caption>页面版本与索引信号</caption>
          <thead><tr><th scope="col">版本</th><th scope="col">canonical</th><th scope="col">robots</th></tr></thead>
          <tbody>
            <tr><th scope="row">中文主页面</th><td><code>/events/reading-festival</code></td><td>index, follow</td></tr>
            <tr><th scope="row">审计副本</th><td><code>/events/reading-festival</code></td><td>noindex, follow</td></tr>
          </tbody>
        </table>
      </div>
      <div class="decision">
        <div><h2>canonical</h2><p>说明重复内容的首选地址，不保证搜索引擎立即采用。</p></div>
        <div><h2>hreflang</h2><p>只在替代版本真实存在且可访问时声明语言关系。</p></div>
      </div>
    </div>
  </body>
</html>`,
      '页面 meta robots 为 noindex, follow，canonical 指向主活动地址；表格清楚对照两种索引策略；320px 下表格可内部滚动或单元格换行，页面无横向溢出。',
    ),
  ),

  'programming:HTML5 · 可访问性、SEO 与国际化：语言、方向与本地化结构': browserLab(
    '语言、方向与本地化结构',
    '正确设置文档语言，在混合语言与从右到左内容中切换 lang 和 dir，避免用视觉对齐代替语义。',
    browserTask(
      'html-css-remaining-i18n-practice',
      '构建双语活动说明',
      '制作中文主页面中的英文日程段，分别声明 lang，并提供时间和地点的一致格式。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>国际设计工作坊</title>
    <style>
      :root { --ink: #202722; --green: #17634c; --paper: #f0f5ef; --line: #b7c5ba; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.7 system-ui, sans-serif; }
      main { width: min(64rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      header { padding: clamp(1.5rem, 5vw, 3rem); background: #244236; color: white; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1; }
      .schedule { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      section { min-width: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      h2 { margin-top: 0; }
      [lang="en"] { font-family: Georgia, "Times New Roman", serif; }
      time { font-weight: 800; color: var(--green); }
      address { margin-top: .5rem; font-style: normal; }
      .localized { padding: .8rem; border-left: .3rem solid #b06b1a; background: #fff3dc; }
      @media (max-width: 25rem) { header, section { padding: .85rem; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p>设计协作系列</p>
        <h1>多语言信息设计工作坊</h1>
        <p>所有参与者使用同一日程，但每个语言版本独立校对日期与地址。</p>
      </header>
      <div class="schedule">
        <section>
          <h2>中文日程</h2>
          <p><time datetime="2026-12-12T09:30:00+08:00">12 月 12 日 09:30</time></p>
          <p>主题：为长文本建立稳定的阅读节奏。</p>
          <address>沪西设计中心，三层培训室</address>
        </section>
        <section lang="en">
          <h2>English schedule</h2>
          <p><time datetime="2026-12-12T09:30:00+08:00">12 December, 09:30 CST</time></p>
          <p>Topic: stable reading rhythm for long-form content.</p>
          <address>West Shanghai Design Centre, Training Room 3F</address>
        </section>
      </div>
      <p class="localized">日期展示可本地化，datetime 属性仍保持同一绝对时间。</p>
    </main>
  </body>
</html>`,
      '英文 section 有 lang=en；两个 time 的 datetime 相同但显示文本本地化；320px 下两个语言版本单列，英文长地址自然换行且页面无横向滚动。',
    ),
    browserTask(
      'html-css-remaining-i18n-apply',
      '嵌入从右到左内容',
      '在中文页面中加入阿拉伯语联系信息和方向为 RTL 的引用块，混合数字与英文时仍保持正确阅读方向。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>国际旅客联络页</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #e9eef0; color: #243037; font: 16px/1.75 system-ui, sans-serif; }
      .page { width: min(68rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #203b4a; color: #f7fbfc; }
      h1 { margin: .25rem 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1.03; }
      .layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      section { min-width: 0; padding: 1rem; background: white; border: 1px solid #aebbc1; }
      h2 { margin-top: 0; }
      [lang="ar"] { font-family: Tahoma, Arial, sans-serif; }
      blockquote { margin: 0; padding: 1rem; border-inline-start: .35rem solid #b26b1b; background: #fff4df; }
      blockquote p { margin: 0; }
      cite { display: block; margin-top: .6rem; color: #655126; font-style: normal; }
      .contact { display: grid; gap: .5rem; margin: 0; padding: 0; list-style: none; }
      .contact li { padding: .65rem; background: #edf4f5; }
      a { color: #0c6070; text-underline-offset: .18em; }
      :focus-visible { outline: 3px solid #c56c17; outline-offset: 3px; }
      @media print { body, header { color: black; background: white; } section { border-color: #555; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>旅客服务中心</p>
        <h1>换乘协助与失物联络</h1>
        <p>中文页面内保留每个段落的真实语言与阅读方向。</p>
      </header>
      <div class="layout">
        <section>
          <h2>中文联络信息</h2>
          <ul class="contact">
            <li>服务台：二号航站楼到达层 2F</li>
            <li>开放时间：每日 07:00—23:00</li>
            <li>失物登记：请在 48 小时内提交物品特征</li>
          </ul>
        </section>
        <section lang="ar" dir="rtl">
          <h2>معلومات الاتصال</h2>
          <blockquote>
            <p>مكتب المساعدة في الطابق الثاني بجوار مخرج 14.</p>
            <cite>فريق خدمة المسافرين</cite>
          </blockquote>
          <p>رقم الغرفة: A-204<br>الهاتف: 021-5550 1840</p>
        </section>
      </div>
    </div>
  </body>
</html>`,
      '阿拉伯语 section 同时声明 lang=ar 与 dir=rtl，引用左侧逻辑边框移到右侧；中文卡片保持 LTR；320px 下两卡单列，混合数字与英文不造成横向溢出。',
    ),
  ),

  'programming:HTML5 · 页面性能与企业站点交付：关键 HTML、CSS、字体与脚本': browserLab(
    '关键资源与渲染路径',
    '用轻量 HTML、系统字体、关键布局样式和明确的加载优先级建立首屏，避免把不必要资源放在解析关键路径。',
    browserTask(
      'html-css-remaining-performance-practice',
      '设计轻量首屏',
      '为首屏公告页安排系统字体、稳定的图片尺寸、关键内容和后续内容的清晰边界。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>系统维护公告</title>
    <style>
      :root { --ink: #202725; --green: #18604c; --paper: #f2f5f1; --line: #b4c0b8; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, "Microsoft YaHei", sans-serif; }
      main { width: min(64rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; align-items: center; }
      h1 { margin: 0; font-size: clamp(2.2rem, 8vw, 5rem); line-height: 1; }
      .hero > svg { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; border: 1px solid var(--line); background: #dce7df; }
      .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: .5rem; margin-top: 1rem; }
      .facts div { padding: .8rem; background: white; border-left: .3rem solid var(--green); }
      .below { margin-top: 1.5rem; padding: 1rem; background: #e2ebe5; }
      [hidden] { display: none; }
      @media (max-width: 26rem) { .hero { gap: .75rem; } .facts div { padding: .7rem; } }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <p>服务公告 / 11 月 24 日</p>
          <h1>今晚 22:00 维护数据库连接</h1>
          <p>首先加载公告正文，随后再加载详细历史记录。系统字体避免额外字体请求。</p>
        </div>
        <svg viewBox="0 0 960 540" role="img" aria-labelledby="window-title window-desc">
          <title id="window-title">维护窗口时间轴</title>
          <desc id="window-desc">时间轴从 22:00 指向 22:20。</desc>
          <rect width="960" height="540" fill="#dfeae3"/>
          <path d="M120 300h720" stroke="#215f4d" stroke-width="18"/>
          <circle cx="180" cy="300" r="34" fill="#215f4d"/>
          <circle cx="780" cy="300" r="34" fill="#b96a1b"/>
          <text x="180" y="390" text-anchor="middle" font-size="44" fill="#202b27">22:00</text>
          <text x="780" y="390" text-anchor="middle" font-size="44" fill="#202b27">22:20</text>
        </svg>
      </section>
      <div class="facts">
        <div><strong>影响</strong><br>报表查询短暂不可用</div>
        <div><strong>数据</strong><br>不会丢失，任务会自动重试</div>
      </div>
      <section class="below">
        <h2>详细历史</h2>
        <p>该区块可以在首屏之后出现，样式与脚本都应保持非阻塞。</p>
      </section>
    </main>
  </body>
</html>`,
      '首屏正文先于图片出现；图片声明宽高比和 fetchpriority=high；未使用外部字体或网络资源；320px 下图文单列，标题、事实卡和正文均无横向溢出。',
    ),
    browserTask(
      'html-css-remaining-performance-apply',
      '制作资源瀑布审计页',
      '用内嵌图表解释 HTML、CSS、字体、图片和脚本的加载顺序，并标出阻塞、延迟和可优化项。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>企业首页资源瀑布审计</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #e7edeb; background: #18211f; font: 15px/1.65 Consolas, "Microsoft YaHei", monospace; }
      .page { width: min(74rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #25332f; border-bottom: .3rem solid #67c59d; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.6rem); line-height: 1; }
      .waterfall { display: grid; gap: .55rem; margin-top: 1rem; }
      .row { display: grid; grid-template-columns: minmax(7rem, .5fr) minmax(0, 1fr) 5rem; gap: .7rem; align-items: center; }
      .track { min-width: 0; height: 1.35rem; background: #31403b; overflow: hidden; }
      .bar { display: block; height: 100%; background: #67c59d; }
      .row:nth-child(2) .bar { width: 28%; background: #e2a24b; }
      .row:nth-child(3) .bar { width: 60%; }
      .row:nth-child(4) .bar { width: 42%; }
      .row:nth-child(5) .bar { width: 75%; background: #d36a57; }
      .label, .duration { overflow-wrap: anywhere; }
      .notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: .75rem; margin-top: 1.25rem; }
      .notes section { min-width: 0; padding: 1rem; background: #24312d; border: 1px solid #50625c; }
      h2 { margin-top: 0; color: #a9e7ca; }
      @media (max-width: 27rem) { .row { grid-template-columns: minmax(0, 1fr) 4rem; } .track { grid-column: 1 / -1; grid-row: 2; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>性能审查 / 首页 LCP</p>
        <h1>资源顺序把首屏推迟了 1.8 秒</h1>
        <p>每个条形只描述一次真实资源阶段，颜色同时配有文字说明。</p>
      </header>
      <section aria-labelledby="waterfall-title">
        <h2 id="waterfall-title">加载瀑布</h2>
        <div class="waterfall">
          <div class="row"><span class="label">HTML</span><span class="track"><span class="bar"></span></span><span class="duration">180 ms</span></div>
          <div class="row"><span class="label">阻塞 CSS</span><span class="track"><span class="bar"></span></span><span class="duration">420 ms</span></div>
          <div class="row"><span class="label">首屏图片</span><span class="track"><span class="bar"></span></span><span class="duration">760 ms</span></div>
          <div class="row"><span class="label">系统字体</span><span class="track"><span class="bar"></span></span><span class="duration">0 ms</span></div>
          <div class="row"><span class="label">非关键脚本</span><span class="track"><span class="bar"></span></span><span class="duration">1.2 s</span></div>
        </div>
      </section>
      <div class="notes">
        <section><h2>阻塞项</h2><p>把首屏样式内联到关键 HTML，延迟非关键样式加载。</p></section>
        <section><h2>图片</h2><p>声明宽高、压缩尺寸并提升首屏图片优先级。</p></section>
        <section><h2>脚本</h2><p>分析任务与非关键分析脚本移到首屏之后，并减少主线程工作。</p></section>
      </div>
    </div>
  </body>
</html>`,
      '五段瀑布都有资源名、条形和毫秒数，颜色不是唯一信息；窄于 432px 时轨道换到第二行；320px 下时长列不被裁切，页面无横向滚动。',
    ),
  ),

  'programming:CSS3 · 级联、继承与盒模型：长度、百分比、fr、min/max 与 clamp': browserLab(
    '相对单位与可伸缩轨道',
    '在同一布局中比较百分比、fr、minmax 和 clamp，理解各自相对什么计算以及何时产生最小内容约束。',
    browserTask(
      'html-css-remaining-units-practice',
      '比较四种宽度策略',
      '制作四列尺规，用百分比、fr、minmax 和 clamp 展示计算规则与窄屏回退。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CSS 长度与轨道实验</title>
    <style>
      :root { --ink: #1f2725; --green: #17664f; --paper: #f0f4f1; --line: #aebbb4; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(70rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 8vw, 4.8rem); line-height: 1; }
      .ruler { display: grid; grid-template-columns: 25% 1fr minmax(12rem, 2fr) clamp(10rem, 30%, 20rem); gap: .5rem; }
      .ruler div { min-width: 0; min-height: 10rem; padding: .8rem; background: white; border: 1px solid var(--line); overflow-wrap: anywhere; }
      .ruler strong { display: block; color: var(--green); font-size: 1.2rem; }
      .formula { margin-top: 1rem; padding: 1rem; border-left: .35rem solid #b16817; background: #fff3df; }
      code { font-family: Consolas, monospace; }
      @media (max-width: 48rem) { .ruler { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 26rem) { .ruler { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <p>布局实验 / 轨道</p>
      <h1>同一个容器，四种宽度规则</h1>
      <section class="ruler" aria-label="宽度策略比较">
        <div><strong>25%</strong><p>相对网格容器内容盒计算。</p></div>
        <div><strong>1fr</strong><p>分配剩余空间，默认最小内容约束会参与计算。</p></div>
        <div><strong>minmax</strong><p>至少 12rem，最多获得两份剩余空间。</p></div>
        <div><strong>clamp</strong><p>最小 10rem，理想值 30%，最大 20rem。</p></div>
      </section>
      <p class="formula"><code>minmax(0, 1fr)</code> 能避免长内容把轨道撑破，是可控布局的重要基线。</p>
    </main>
  </body>
</html>`,
      '1280px 下四列同排并体现不同宽度；768px 至 416px 为两列；320px 为单列；所有卡片文字在卡内换行，页面 scrollWidth 不超过 clientWidth。',
    ),
    browserTask(
      'html-css-remaining-units-apply',
      '设计响应式定价卡',
      '用 clamp 字体、minmax 卡片轨道和容器内百分比间距，建立不依赖固定像素的定价区。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>团队定价方案</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #e9eef2; color: #202b34; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(74rem, 100%); margin: auto; padding: 1rem; }
      header { max-width: 42rem; padding: clamp(1.25rem, 5vw, 3rem); }
      h1 { margin: 0; font-size: clamp(2.2rem, 9vw, 5.2rem); line-height: .98; }
      .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: clamp(.75rem, 2vw, 1.25rem); }
      article { min-width: 0; display: flex; flex-direction: column; padding: 7%; background: white; border: 1px solid #aeb9c2; }
      h2 { font-size: clamp(1.15rem, 2.5vw, 1.5rem); }
      .price { font-size: clamp(2rem, 7vw, 3.8rem); font-weight: 900; line-height: 1; }
      .price small { font-size: .32em; font-weight: 600; }
      ul { flex: 1; padding-left: 1.2rem; }
      a { display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center; margin-top: .75rem; padding: .55rem 1rem; color: white; background: #195d72; text-align: center; }
      :focus-visible { outline: 3px solid #cf741b; outline-offset: 3px; }
      @media (max-width: 25rem) { .page, header { padding-inline: .75rem; } article { padding: 1rem; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>协作工具 / 团队版</p>
        <h1>按团队规模选择工作空间</h1>
        <p>价格和间距随容器伸缩，但最小可点击区域与可读字号保持稳定。</p>
      </header>
      <main class="plans">
        <article><h2>起步版</h2><p class="price">¥49<small> / 月</small></p><ul><li>5 个成员</li><li>10 GB 资料</li></ul><a href="#start">选择起步版</a></article>
        <article><h2>协作版</h2><p class="price">¥129<small> / 月</small></p><ul><li>20 个成员</li><li>100 GB 资料</li><li>审批流程</li></ul><a href="#team">选择协作版</a></article>
        <article><h2>组织版</h2><p class="price">按需<small> 报价</small></p><ul><li>不限成员</li><li>单点登录</li><li>专属支持</li></ul><a href="#org">联系方案顾问</a></article>
      </main>
    </div>
  </body>
</html>`,
      '价格字号由 clamp 控制；卡片轨道可自动换列；320px 下卡片单列且价格、列表、按钮不重叠；所有链接高度至少 44px，页面无横向溢出。',
    ),
  ),

  'programming:CSS3 · 级联、继承与盒模型：溢出、换行、滚动容器与文字截断': browserLab(
    '可控溢出与文字边界',
    '区分页面级横向溢出、容器内部滚动和多行截断，优先保证重要内容可读且可操作。',
    browserTask(
      'html-css-remaining-overflow-practice',
      '比较四种文本处理',
      '展示自然换行、强制断词、单行省略和多行截断，并解释各自适用场景。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>文本溢出处理实验</title>
    <style>
      :root { --ink: #202827; --green: #17614d; --paper: #f0f5f1; --line: #aab9b0; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(72rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: .8rem; }
      article { min-width: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      h2 { margin-top: 0; font-size: 1.1rem; }
      .specimen { padding: .75rem; background: #edf4ef; border-left: .3rem solid var(--green); }
      .anywhere { overflow-wrap: anywhere; }
      .single { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .multi { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      .scroll { max-width: 100%; overflow-x: auto; padding-bottom: .35rem; }
      .scroll code { white-space: nowrap; }
      p { margin-bottom: 0; }
    </style>
  </head>
  <body>
    <main>
      <p>排版实验 / 长内容</p>
      <h1>让溢出发生在可预期的位置</h1>
      <div class="grid">
        <article><h2>自然换行</h2><p class="specimen">城市基础设施监测平台需要同时展示观测站编号、维护窗口和备用联系人。</p></article>
        <article><h2>强制断词</h2><p class="specimen anywhere">MONITORING-STATION-IDENTIFIER-HBR-NORTH-1842-WINTER</p></article>
        <article><h2>单行省略</h2><p class="specimen single" title="河港北区冬季传感器校准与维护记录">河港北区冬季传感器校准与维护记录</p></article>
        <article><h2>两行截断</h2><p class="specimen multi">仅在摘要场景使用截断，并保留详情入口。完整内容不能依赖悬浮提示才可访问。</p></article>
        <article><h2>局部滚动</h2><div class="scroll"><code>station=hbr-north&amp;window=2026-12-06T09%3A30%2B08%3A00&amp;mode=calibration</code></div></article>
      </div>
    </main>
  </body>
</html>`,
      '320px 下所有卡片单列；强制断词不会撑破卡片；单行标题出现省略号；局部滚动容器内部可横向滚动而 body 无横向溢出；截断示例保留详情文字说明。',
    ),
    browserTask(
      'html-css-remaining-overflow-apply',
      '设计审计日志查看器',
      '用可滚动表格、固定宽度列、换行策略和摘要卡展示长日志，在手机上保持页面边界稳定。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>审计日志查看器</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #e7eeeb; background: #17211e; font: 15px/1.6 Consolas, "Microsoft YaHei", monospace; }
      .page { width: min(76rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #25332f; border-bottom: .3rem solid #64c49b; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .65rem; margin-block: 1rem; }
      .summary div { min-width: 0; padding: .8rem; background: #22302b; border: 1px solid #50625b; overflow-wrap: anywhere; }
      .table-wrap { max-width: 100%; overflow: auto; border: 1px solid #50625b; }
      table { width: 100%; min-width: 44rem; border-collapse: collapse; background: #202b27; }
      caption { padding: .8rem; text-align: left; color: #a9e6c8; font-weight: 800; }
      th, td { padding: .65rem .8rem; border-bottom: 1px solid #43534d; text-align: left; vertical-align: top; }
      th { position: sticky; top: 0; background: #2d3b36; }
      td:last-child { min-width: 18rem; overflow-wrap: anywhere; }
      .status { color: #f1c475; }
      .hint { color: #b8c7c1; }
      @media (max-width: 30rem) { .page { padding-inline: .65rem; } th, td { padding: .55rem; } }
      @media print { body { color: black; background: white; } header, .summary div, table { color: black; background: white; } .table-wrap { overflow: visible; } table { min-width: 0; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p>访问审计 / 11 月 24 日</p>
        <h1>敏感文档访问记录</h1>
        <p class="hint">表格在窄屏内部滚动，摘要卡负责给出最重要的统计结果。</p>
      </header>
      <div class="summary">
        <div><strong>总事件</strong><br>128</div>
        <div><strong>被拒绝</strong><br><span class="status">7</span></div>
        <div><strong>最长请求号</strong><br>req_2f6f5a09-5a19-4ff4-a5aa-9824c4518bd0</div>
      </div>
      <div class="table-wrap" tabindex="0" aria-label="可横向滚动的审计日志表格">
        <table>
          <caption>最近五次访问事件</caption>
          <thead><tr><th scope="col">时间</th><th scope="col">操作者</th><th scope="col">动作</th><th scope="col">请求标识</th></tr></thead>
          <tbody>
            <tr><td>18:42:07</td><td>lin.lan</td><td>读取合同摘要</td><td>req_2f6f5a09-5a19-4ff4-a5aa-9824c4518bd0</td></tr>
            <tr><td>18:41:52</td><td>guest-07</td><td class="status">拒绝：权限不足</td><td>req_a0c1318f-d0b2-4716-a24d-b138f7619551</td></tr>
            <tr><td>18:40:18</td><td>wang.yu</td><td>导出审计清单</td><td>req_d722f911-fc81-474c-a6e9-4bd07837c914</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>`,
      '表格容器可键盘聚焦并独立横向滚动；页面本身在 320px 无横向溢出；长请求号在摘要卡换行；打印时取消固定最小宽度并保留全部日志文字。',
    ),
  ),

  'programming:CSS3 · 级联、继承与盒模型：级联调试与组件样式基线': browserLab(
    '级联调试与样式基线',
    '按来源、层、特异性和顺序追踪声明胜负，并为组件建立最小、可预测的样式基线。',
    browserTask(
      'html-css-remaining-cascade-practice',
      '追踪按钮最终颜色',
      '展示用户代理、基础层、组件层和未分层规则竞争后的计算样式，并列出调试顺序。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>级联胜负追踪</title>
    <style>
      @layer reset, base, components;
      @layer reset { button { margin: 0; font: inherit; } }
      @layer base { button { min-height: 2.75rem; padding: .6rem 1rem; border: 2px solid #173d4c; color: #173d4c; background: white; } }
      @layer components { button.primary { color: white; background: #176b73; } }
      :root { --ink: #1d282e; --paper: #eff4f5; --line: #b3c1c6; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(64rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1; }
      .demo { padding: 1rem; background: white; border: 1px solid var(--line); }
      .demo button { margin-inline-end: .5rem; }
      ol { display: grid; gap: .55rem; padding-left: 1.4rem; }
      li code { background: #e3ecee; padding: .1rem .3rem; }
      :focus-visible { outline: 3px solid #c67018; outline-offset: 3px; }
      @media (max-width: 25rem) { .demo button { width: 100%; margin: 0 0 .5rem; } }
    </style>
  </head>
  <body>
    <main>
      <p>样式诊断 / 按钮</p>
      <h1>为什么主按钮最后是青色？</h1>
      <div class="demo">
        <button class="primary" type="button">保存更改</button>
        <button type="button">取消</button>
      </div>
      <h2>从强到弱检查</h2>
      <ol>
        <li><code>来源与重要性</code>：作者普通声明高于用户代理普通声明。</li>
        <li><code>层叠层</code>：未分层普通声明高于 components 层。</li>
        <li><code>特异性</code>：同一层中 button.primary 高于 button。</li>
        <li><code>顺序</code>：前面仍打平时，后出现声明获胜。</li>
      </ol>
    </main>
  </body>
</html>`,
      '主按钮计算背景为青色、文字白色，次按钮为白底深色文字；说明按来源、层、特异性、顺序排列；320px 下按钮各占一行，焦点轮廓完整可见。',
    ),
    browserTask(
      'html-css-remaining-cascade-apply',
      '建立组件样式基线',
      '用 reset、tokens、base、components、utilities 五层组织通知组件，并展示一处明确覆盖。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>通知组件样式基线</title>
    <style>
      @layer reset, tokens, base, components, utilities;
      @layer reset { *, *::before, *::after { box-sizing: border-box; } body, h1, h2, p { margin: 0; } }
      @layer tokens { :root { --ink: #202825; --surface: #ffffff; --line: #aebbb5; --brand: #1b6750; --warning: #9a5e16; --space: 1rem; } }
      @layer base { body { color: var(--ink); background: #eef3ef; font: 16px/1.65 system-ui, sans-serif; } }
      @layer components {
        .notice { padding: var(--space); background: var(--surface); border: 1px solid var(--line); border-inline-start: .35rem solid var(--brand); }
        .notice h2 { margin-bottom: .35rem; font-size: 1.15rem; }
        .notice[data-tone="warning"] { border-color: var(--warning); background: #fff5e4; }
      }
      @layer utilities { .stack > * + * { margin-top: var(--space); } .measure { max-width: 50rem; } }
      .local-override { padding: calc(var(--space) * 1.5); }
      main { width: min(70rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; margin-bottom: 1rem; }
      .layer-map { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: .5rem; margin-top: 1rem; }
      .layer-map span { padding: .65rem; text-align: center; border: 1px solid var(--line); background: white; }
      @media (max-width: 26rem) { :root { --space: .8rem; } .local-override { padding: .9rem; } }
    </style>
  </head>
  <body>
    <main>
      <p>设计系统 / 基线</p>
      <h1>通知组件只继承明确的层</h1>
      <div class="stack measure">
        <section class="notice">
          <h2>同步完成</h2>
          <p>128 条记录已更新，下一次同步将在 30 分钟后执行。</p>
        </section>
        <section class="notice local-override" data-tone="warning">
          <h2>需要注意</h2>
          <p>本实例只覆盖数据属性与局部间距，不复制整组组件规则。</p>
        </section>
      </div>
      <div class="layer-map" aria-label="样式层顺序"><span>reset</span><span>tokens</span><span>base</span><span>components</span><span>utilities</span></div>
    </main>
  </body>
</html>`,
      '样式开头按 reset、tokens、base、components、utilities 声明层顺序；警告通知同时有数据属性和文字提示；320px 下层序图自动换行，通知内文字不溢出。',
    ),
  ),

  'programming:CSS3 · Flex、Grid 与页面布局：定位、粘性、层级与包含块': browserLab(
    '定位上下文与粘性边界',
    '用 relative、absolute、sticky 和隔离的 stacking context 建立可预测浮层，避免 z-index 竞争。',
    browserTask(
      'html-css-remaining-position-practice',
      '制作带粘性目录的文章',
      '建立 article 定位上下文、粘性章节目录和角标，明确哪个元素产生包含块。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>粘性目录与定位上下文</title>
    <style>
      :root { --ink: #242a27; --green: #1a654d; --paper: #f3f5f1; --line: #b5c0b8; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.7 system-ui, sans-serif; }
      .page { width: min(70rem, 100%); margin: auto; padding: 1rem; }
      article { position: relative; display: grid; gap: 1rem; padding: 1rem; background: white; border: 1px solid var(--line); }
      .badge { position: absolute; top: 1rem; right: 1rem; padding: .3rem .55rem; color: white; background: #a35b18; }
      .layout { display: grid; gap: 1rem; }
      nav { align-self: start; padding: .75rem; background: #e7f0ea; }
      nav h2 { margin: 0; font-size: 1rem; }
      nav ol { margin-bottom: 0; padding-left: 1.2rem; }
      main { min-width: 0; }
      section { min-height: 14rem; padding-block: 1rem; border-top: 1px solid var(--line); }
      h1, h2 { line-height: 1.2; }
      h1 { padding-right: 7rem; font-size: clamp(2rem, 7vw, 4.4rem); }
      @media (min-width: 48rem) {
        .layout { grid-template-columns: 13rem minmax(0, 1fr); }
        nav { position: sticky; top: 1rem; }
      }
      @media (max-width: 30rem) { .badge { position: static; justify-self: start; } h1 { padding-right: 0; } }
    </style>
  </head>
  <body>
    <div class="page">
      <article>
        <span class="badge">更新版</span>
        <h1>水泵巡检手册</h1>
        <div class="layout">
          <nav aria-label="手册目录">
            <h2>章节</h2>
            <ol><li><a href="#before">巡检前</a></li><li><a href="#run">运行检查</a></li><li><a href="#after">停机记录</a></li></ol>
          </nav>
          <main>
            <section id="before"><h2>巡检前</h2><p>确认阀门位置、警示标识和备用电源。</p></section>
            <section id="run"><h2>运行检查</h2><p>记录压力、噪声、振动和轴承温度。</p></section>
            <section id="after"><h2>停机记录</h2><p>保存读数，补充异常照片和处置人。</p></section>
          </main>
        </div>
      </article>
    </div>
  </body>
</html>`,
      '桌面滚动时目录保持粘在顶部 1rem；角标相对 article 定位；390px 和 320px 下角标回到文档流；所有目录链接可跳转且页面无横向溢出。',
    ),
    browserTask(
      'html-css-remaining-position-apply',
      '隔离通知浮层层级',
      '制作工具栏、卡片列表和绝对定位通知，把浮层层级限制在组件容器内并保留关闭按钮位置。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>隔离通知浮层</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #e9eef1; color: #202a31; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .workspace { width: min(72rem, 100%); margin: auto; padding: 1rem; }
      .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; gap: 1rem; padding: .8rem; background: #203c4b; color: white; }
      .toolbar a { color: white; }
      .canvas { position: relative; isolation: isolate; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      .card { min-width: 0; padding: 1rem; background: white; border: 1px solid #aab7bd; }
      .notifications { position: absolute; top: .5rem; right: .5rem; z-index: 2; width: min(21rem, calc(100% - 1rem)); padding: 1rem 3rem 1rem 1rem; background: #fff3dd; border: 1px solid #b8731c; box-shadow: 0 3px 10px #26364033; }
      .notifications h2 { margin: 0; font-size: 1.05rem; }
      .notifications p { margin-bottom: 0; }
      .close { position: absolute; top: .4rem; right: .4rem; display: inline-grid; width: 2.5rem; height: 2.5rem; place-items: center; border: 1px solid #8d5515; color: #5d390d; background: white; text-decoration: none; }
      .under { position: relative; z-index: 1; }
      :focus-visible { outline: 3px solid #d2761b; outline-offset: 3px; }
      @media (max-width: 34rem) { .toolbar { align-items: flex-start; flex-direction: column; } .notifications { position: static; width: 100%; margin-bottom: 1rem; } .canvas { display: flex; flex-direction: column; } .notifications { order: -1; } }
    </style>
  </head>
  <body>
    <div class="workspace">
      <header class="toolbar"><strong>部署看板</strong><a href="#settings">环境设置</a></header>
      <div class="canvas">
        <aside class="notifications" role="status" aria-labelledby="notice-title">
          <h2 id="notice-title">最后一次部署完成</h2>
          <p>版本 4.7.2 已在预发布环境运行 18 分钟。</p>
          <a class="close" href="#dismiss" aria-label="关闭部署通知">×</a>
        </aside>
        <section class="card under"><h2>生产环境</h2><p>当前版本 4.7.1，运行稳定。</p></section>
        <section class="card under"><h2>预发布环境</h2><p>新版本正在接受检查。</p></section>
      </div>
      <p id="settings">环境设置说明：通知位于 canvas 隔离层中，不参与页面其他 z-index 竞争。</p>
    </div>
  </body>
</html>`,
      '桌面通知固定在 canvas 右上且关闭按钮完整；工具栏保持粘性；390px 和 320px 下通知进入文档流并排在最前；关闭链接有可访问名称和 40×40px 目标。',
    ),
  ),

  'programming:CSS3 · Flex、Grid 与页面布局：侧栏、工具栏、表格与卡片布局': browserLab(
    '侧栏、工具栏与数据面板',
    '组合 Grid 主框架、Flex 工具栏、可滚动表格和等高卡片，在窄屏下按信息优先级重排。',
    browserTask(
      'html-css-remaining-dashboard-practice',
      '搭建运维双栏工作台',
      '建立固定侧栏、粘性工具栏、主内容表格和统计卡片，并控制各区域最小宽度。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>运维工作台布局</title>
    <style>
      :root { --ink: #1f2926; --green: #1a654c; --line: #aebbb5; --paper: #edf3ef; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 15px/1.6 system-ui, sans-serif; }
      .shell { display: grid; grid-template-columns: 13rem minmax(0, 1fr); min-height: 100vh; }
      aside { padding: 1rem; color: white; background: #203b32; }
      aside a { display: flex; min-height: 2.75rem; align-items: center; padding: .4rem .55rem; color: white; }
      aside a[aria-current="page"] { outline: 2px solid #8ed0b3; outline-offset: -3px; }
      .content { min-width: 0; }
      header { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; padding: .8rem 1rem; background: #f8fbf9; border-bottom: 1px solid var(--line); }
      main { padding: 1rem; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); gap: .75rem; }
      .card { min-width: 0; padding: .9rem; background: white; border: 1px solid var(--line); }
      .card strong { display: block; font-size: 1.6rem; }
      .table-wrap { max-width: 100%; overflow-x: auto; margin-top: 1rem; border: 1px solid var(--line); }
      table { width: 100%; min-width: 36rem; border-collapse: collapse; background: white; }
      caption { padding: .75rem; text-align: left; font-weight: 800; }
      th, td { padding: .65rem; border-bottom: 1px solid var(--line); text-align: left; }
      @media (max-width: 48rem) { .shell { grid-template-columns: 1fr; } aside nav { display: flex; flex-wrap: wrap; gap: .3rem; } aside a { min-height: 2.5rem; } }
      @media print { .shell { display: block; } aside { color: black; background: white; } header { position: static; } .table-wrap { overflow: visible; } table { min-width: 0; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <p><strong>港区运维</strong></p>
        <nav aria-label="工作台导航">
          <a href="#overview" aria-current="page">总览</a>
          <a href="#equipment">设备</a>
          <a href="#alerts">告警</a>
        </nav>
      </aside>
      <div class="content">
        <header><strong>东区泵站</strong><a href="#refresh">刷新数据</a></header>
        <main>
          <section class="cards" id="overview" aria-label="关键指标">
            <article class="card"><span>在线设备</span><strong>42</strong><small>共 43 台</small></article>
            <article class="card"><span>未确认告警</span><strong>3</strong><small>其中 1 项高优先</small></article>
            <article class="card"><span>今日巡检</span><strong>91%</strong><small>比昨日高 4%</small></article>
          </section>
          <div class="table-wrap" id="equipment">
            <table>
              <caption>最近设备读数</caption>
              <thead><tr><th scope="col">设备</th><th scope="col">状态</th><th scope="col">压力</th><th scope="col">更新时间</th></tr></thead>
              <tbody><tr><td>P-101</td><td>运行</td><td>0.82 MPa</td><td>18:42</td></tr><tr><td>P-204</td><td>维护</td><td>0.00 MPa</td><td>17:55</td></tr></tbody>
            </table>
          </div>
          <p id="refresh">刷新后保留当前筛选条件。</p>
        </main>
      </div>
    </div>
  </body>
</html>`,
      '桌面侧栏与主区同高；工具栏滚动时粘在顶部；320px 下侧栏变顶部横向导航且表格只在自己的容器滚动；打印时取消侧栏双栏和表格最小宽度。',
    ),
    browserTask(
      'html-css-remaining-dashboard-apply',
      '设计内容审核面板',
      '把筛选工具栏、审核队列和详情卡组成三栏工作区，并在手机上转成单列优先队列。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>内容审核工作区</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #20272b; background: #edf0f2; font: 15px/1.6 "Microsoft YaHei", sans-serif; }
      .page { width: min(78rem, 100%); margin: auto; padding: 1rem; }
      .toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; padding: .9rem; background: #333b45; color: white; }
      .toolbar label { display: grid; gap: .2rem; }
      select, input { min-height: 2.5rem; padding: .35rem .5rem; border: 1px solid #8796a3; border-radius: 0; font: inherit; }
      .toolbar a { display: inline-flex; min-height: 2.5rem; align-items: center; color: white; }
      .workspace { display: grid; grid-template-columns: minmax(12rem, .7fr) minmax(18rem, 1.4fr) minmax(16rem, 1fr); gap: 1rem; margin-top: 1rem; }
      .queue, .detail, .filters { min-width: 0; padding: 1rem; background: white; border: 1px solid #aab5bc; }
      .queue ul { display: grid; gap: .65rem; padding: 0; list-style: none; }
      .queue li { padding: .75rem; background: #edf3f7; border-left: .3rem solid #1b677a; }
      .queue a { color: #125667; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: .5rem; }
      .meta div { padding: .6rem; background: #eef2f4; }
      blockquote { margin: 1rem 0; padding: .8rem; border-left: .3rem solid #b06a18; background: #fff5e5; }
      .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
      button { min-height: 2.75rem; padding: .5rem .8rem; border: 2px solid #1c5e70; font: inherit; }
      .approve { color: white; background: #1c5e70; }
      @media (max-width: 58rem) { .workspace { grid-template-columns: minmax(0, 1fr) minmax(16rem, 1fr); } .filters { grid-column: 1 / -1; order: -1; } }
      @media (max-width: 38rem) { .workspace { grid-template-columns: 1fr; } .filters { order: 1; } .queue { order: 2; } .detail { order: 3; } .toolbar label, .toolbar select, .toolbar input { width: 100%; } }
    </style>
  </head>
  <body>
    <div class="page">
      <form class="toolbar">
        <strong>内容审核</strong>
        <label>队列<select><option>待审核 12</option></select></label>
        <label>搜索<input type="search" placeholder="标题或作者"></label>
        <a href="#queue">查看全部</a>
      </form>
      <div class="workspace">
        <aside class="filters"><h2>筛选</h2><p>风险等级</p><label><input type="checkbox" checked> 中高风险</label><p>内容类型</p><label><input type="checkbox" checked> 图文说明</label></aside>
        <section class="queue" id="queue"><h2>队列</h2><ul><li><a href="#article">潮汐观测站向公众开放</a><br><small>风险：中 · 18:32</small></li><li><a href="#article">周末码头交通调整</a><br><small>风险：低 · 18:10</small></li></ul></section>
        <article class="detail" id="article">
          <h2>潮汐观测站向公众开放</h2>
          <div class="meta"><div>作者：周宁</div><div>类型：图文</div><div>风险：中</div></div>
          <blockquote>开放时段为每周六 09:00—16:00，恶劣天气暂停。</blockquote>
          <div class="actions"><button class="approve" type="button">通过</button><button type="button">退回修改</button></div>
        </article>
      </div>
    </div>
  </body>
</html>`,
      '1280px 三栏并排；900px 左右筛选区跨栏；608px 以下按筛选、队列、详情单列；320px 工具栏控件全宽，按钮换行且页面无横向溢出。',
    ),
  ),

  'programming:CSS3 · Flex、Grid 与页面布局：响应式后台页面布局实验': browserLab(
    '后台布局的内容断点',
    '从内容需要出发设置断点，让导航、筛选、数据区和操作区在不同宽度保持清晰主次。',
    browserTask(
      'html-css-remaining-admin-practice',
      '搭建订单后台骨架',
      '用单列、双列和三列三个阶段组织后台，并确保表格与筛选始终局部滚动。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>订单后台布局实验</title>
    <style>
      :root { --ink: #1f292e; --teal: #155f68; --paper: #edf2f3; --line: #acb9bd; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 15px/1.6 system-ui, sans-serif; }
      .admin { display: grid; grid-template-columns: 1fr; min-height: 100vh; }
      .brand { padding: 1rem; background: #203a42; color: white; }
      .nav { display: flex; flex-wrap: wrap; gap: .35rem; padding: .5rem; background: #e0e9ea; }
      .nav a { display: inline-flex; min-height: 2.75rem; align-items: center; padding: .45rem .7rem; color: #164e56; }
      .nav a[aria-current="page"] { background: white; outline: 2px solid #164e56; outline-offset: -3px; }
      main { min-width: 0; padding: 1rem; }
      .filters { display: grid; grid-template-columns: 1fr; gap: .65rem; padding: 1rem; background: white; border: 1px solid var(--line); }
      label { display: grid; gap: .2rem; font-weight: 700; }
      input, select { min-height: 2.75rem; padding: .45rem .55rem; border: 1px solid #87979d; border-radius: 0; font: inherit; }
      .table-wrap { max-width: 100%; overflow-x: auto; margin-top: 1rem; background: white; border: 1px solid var(--line); }
      table { width: 100%; min-width: 38rem; border-collapse: collapse; }
      caption { padding: .8rem; text-align: left; font-weight: 800; }
      th, td { padding: .65rem; border-bottom: 1px solid var(--line); text-align: left; }
      @media (min-width: 44rem) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 64rem) {
        .admin { grid-template-columns: 14rem minmax(0, 1fr); grid-template-rows: auto 1fr; }
        .brand { grid-column: 1 / -1; }
        .nav { display: grid; align-content: start; }
        .filters { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
      @media print { .admin { display: block; } .nav { display: none; } .table-wrap { overflow: visible; } table { min-width: 0; } }
    </style>
  </head>
  <body>
    <div class="admin">
      <header class="brand"><strong>采购运营台</strong></header>
      <nav class="nav" aria-label="后台导航"><a href="#orders" aria-current="page">订单</a><a href="#suppliers">供应商</a><a href="#reports">报表</a></nav>
      <main>
        <form class="filters">
          <label>订单状态<select><option>全部</option><option>待发货</option></select></label>
          <label>供应商<input type="search" value="北辰"></label>
          <label>开始日期<input type="date" value="2026-11-01"></label>
          <button type="submit">筛选订单</button>
        </form>
        <div class="table-wrap" id="orders">
          <table><caption>匹配订单</caption><thead><tr><th scope="col">订单号</th><th scope="col">供应商</th><th scope="col">状态</th><th scope="col">金额</th></tr></thead><tbody><tr><td>PO-18421</td><td>北辰金属</td><td>待发货</td><td>¥ 18,420</td></tr><tr><td>PO-18422</td><td>北辰五金</td><td>已发货</td><td>¥ 7,860</td></tr></tbody></table>
        </div>
      </main>
    </div>
  </body>
</html>`,
      '704px 以下筛选单列、以上两列；1024px 时导航成为左侧栏且筛选四列；320px 下所有筛选控件全宽，表格仅容器内部滚动，打印隐藏导航。',
    ),
    browserTask(
      'html-css-remaining-admin-apply',
      '设计客服工单桌面',
      '让工单列表、会话详情和客户资料在宽屏并排、窄屏依次显示，并保持操作按钮可达。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>客服工单工作区</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #20292f; background: #e9eef2; font: 15px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(80rem, 100%); margin: auto; padding: 1rem; }
      .top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .8rem; align-items: center; padding: .9rem; background: #293a4a; color: #f7fafc; }
      .top a { color: white; }
      .workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: .8rem; margin-top: .8rem; }
      section { min-width: 0; padding: 1rem; background: white; border: 1px solid #aab6be; }
      h1, h2 { margin-top: 0; line-height: 1.2; }
      h1 { font-size: clamp(1.8rem, 5vw, 3.2rem); }
      .tickets { display: grid; gap: .55rem; padding: 0; list-style: none; }
      .tickets li { padding: .75rem; background: #edf3f7; border-left: .3rem solid #27788a; }
      .tickets a { color: #135b6b; }
      .thread { display: grid; gap: .65rem; }
      .message { padding: .8rem; background: #eef2f4; }
      .message.reply { margin-left: 8%; background: #e0f1ea; }
      .customer { display: grid; gap: .5rem; margin: 0; }
      .customer div { padding: .65rem; background: #f2f4f5; }
      dt { font-weight: 800; }
      dd { margin: 0; overflow-wrap: anywhere; }
      .composer { display: grid; gap: .6rem; margin-top: 1rem; }
      textarea { min-height: 7rem; width: 100%; padding: .6rem; border: 1px solid #87969e; border-radius: 0; font: inherit; resize: vertical; }
      .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
      button { min-height: 2.9rem; padding: .6rem .9rem; border: 2px solid #1b6477; font: 800 1rem/1 system-ui, sans-serif; }
      .primary { color: white; background: #1b6477; }
      :focus-visible { outline: 3px solid #cc741b; outline-offset: 3px; }
      @media (min-width: 48rem) { .workspace { grid-template-columns: minmax(13rem, .8fr) minmax(20rem, 1.5fr); } .customer { grid-column: 1 / -1; } }
      @media (min-width: 72rem) { .workspace { grid-template-columns: minmax(14rem, .7fr) minmax(24rem, 1.5fr) minmax(15rem, .8fr); } .customer { grid-column: auto; } }
      @media (max-width: 28rem) { .page { padding-inline: .65rem; } .top { align-items: flex-start; flex-direction: column; } section { padding: .85rem; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="top"><div><p>客服工作台</p><h1>工单 TK-8302</h1></div><a href="#queue">返回队列</a></header>
      <div class="workspace">
        <section id="queue"><h2>待处理工单</h2><ul class="tickets"><li><a href="#conversation">发票抬头需要修改</a><br><small>等待 12 分钟</small></li><li><a href="#conversation">订单配送日期咨询</a><br><small>等待 28 分钟</small></li></ul></section>
        <section id="conversation">
          <h2>会话详情</h2>
          <div class="thread"><p class="message">客户：昨天的发票抬头少了一个字，能否重新开具？</p><p class="message reply">客服：可以，请确认完整名称与税号。</p></div>
          <form class="composer"><label for="reply">回复内容</label><textarea id="reply">已收到资料，正在核对新抬头。</textarea><div class="actions"><button class="primary" type="submit">发送回复</button><button type="button">保存草稿</button></div></form>
        </section>
        <aside class="customer"><h2>客户资料</h2><dl><div><dt>公司</dt><dd>澄海设备工程有限公司</dd></div><div><dt>联系人</dt><dd>林岚</dd></div><div><dt>最近订单</dt><dd>PO-18421</dd></div></dl></aside>
      </div>
    </div>
  </body>
</html>`,
      '768px 以下单列，客户资料排在最后；1152px 时三栏并排；320px 下回复按钮换行、公司名称和长文本可换行，焦点轮廓完整且无页面级横向滚动。',
    ),
  ),

  'programming:CSS3 · 响应式、容器查询与移动布局：流式字体、行高与阅读宽度': browserLab(
    '流式字体与可读行宽',
    '用 clamp 控制字号、用 ch 限制行宽、保持 1.5 以上行高，并避免视口缩放导致字号过小。',
    browserTask(
      'html-css-remaining-fluid-type-practice',
      '建立长文阅读版心',
      '为技术文章设置流式标题、正文行宽、段落节奏和代码块局部滚动。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>流式排版与阅读宽度</title>
    <style>
      :root { --ink: #282923; --paper: #f7f3e9; --accent: #7a4c1e; --line: #cbbfa8; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font-family: Georgia, "Songti SC", serif; }
      main { width: min(100% - 2rem, 48rem); margin-inline: auto; padding-block: clamp(2rem, 8vw, 6rem); }
      .eyebrow { font: 700 .78rem/1.5 system-ui, sans-serif; letter-spacing: .08em; color: var(--accent); }
      h1 { max-width: 16ch; margin: .35rem 0 1rem; font-size: clamp(2.25rem, 9vw, 5rem); line-height: .98; }
      .lede { max-width: 38rem; font-size: clamp(1.05rem, 2.5vw, 1.25rem); color: #5c5548; }
      article { max-width: 66ch; }
      h2 { margin-top: 2.5em; font-size: clamp(1.45rem, 4vw, 2rem); line-height: 1.2; }
      p, li { font-size: clamp(1rem, 2vw, 1.125rem); line-height: 1.75; }
      pre { max-width: 100%; overflow-x: auto; padding: 1rem; border: 1px solid var(--line); background: #eee7d8; font-family: Consolas, monospace; }
      @media (max-width: 24rem) { main { width: min(100% - 1.2rem, 48rem); } h1 { font-size: 2.1rem; } p, li { font-size: 1rem; } }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">排版手册 / 03</p>
      <h1>让屏幕上的长文保持呼吸</h1>
      <p class="lede">标题按视口平滑变化，正文仍使用稳定可读的最小字号和受控行宽。</p>
      <article>
        <h2>先限制行宽</h2>
        <p>中文正文每个字接近一个方块，行长需要比英文短；使用 ch 只是近似约束，还要结合 padding 和容器宽度观察。</p>
        <h2>再调整节奏</h2>
        <p>段落行高保持足够，标题与正文之间使用较大的段前距。不要让视觉字号成为选择标题级别的依据。</p>
        <pre><code>font-size: clamp(1rem, 2vw, 1.125rem);
line-height: 1.75;
max-width: 66ch;</code></pre>
      </article>
    </main>
  </body>
</html>`,
      '320px 下标题约 34px 且正文不缩小到 16px 以下；正文列宽不超过约 66 个字符；行高至少 1.75；代码块内部滚动且页面无横向溢出。',
    ),
    browserTask(
      'html-css-remaining-fluid-type-apply',
      '制作品牌故事阅读页',
      '设计带引言、章节标题、图注和术语说明的品牌故事，控制每段可读宽度和移动字号。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>海岸工坊品牌故事</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #1f2926; background: #edf1ea; font-family: "Microsoft YaHei", sans-serif; }
      .page { width: min(72rem, calc(100% - 2rem)); margin: auto; padding-block: clamp(1.5rem, 6vw, 5rem); }
      header { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 2rem; align-items: end; margin-bottom: 3rem; }
      h1 { max-width: 12ch; margin: 0; font-size: clamp(2.5rem, 10vw, 6.2rem); line-height: .92; color: #1b5545; }
      .intro { max-width: 34rem; font-size: clamp(1rem, 2.4vw, 1.2rem); line-height: 1.75; }
      article { max-width: 68ch; margin-inline: auto; }
      h2 { margin-top: 2.2em; font-size: clamp(1.45rem, 4vw, 2.1rem); line-height: 1.2; }
      p { margin-block: 1em; font-size: clamp(1rem, 2vw, 1.125rem); line-height: 1.8; }
      blockquote { margin: 2rem 0; padding: 1rem 1.25rem; border-inline-start: .4rem solid #a6621b; background: #fff5df; font-size: clamp(1.15rem, 3vw, 1.5rem); line-height: 1.55; }
      figure { margin: 2rem 0; }
      figure svg { display: block; width: 100%; height: auto; border: 1px solid #aebbb3; }
      figcaption { margin-top: .5rem; color: #56635d; font-size: .92rem; line-height: 1.55; }
      dt { font-weight: 850; }
      dd { margin: .2rem 0 1rem; line-height: 1.7; }
      @media (max-width: 25rem) { .page { width: calc(100% - 1.2rem); } blockquote { padding-inline: 1rem; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header><h1>把潮汐的颜色留在器物上</h1><p class="intro">海岸工坊从本地矿物和旧木料中寻找材料，记录每一批器物与季节、潮位和手艺人的关系。</p></header>
      <article>
        <h2>从一块旧船木开始</h2>
        <p>材料进入工坊时先编号，再记录来源、含水率和可用尺寸。纹理不是装饰，而是决定结构方向的依据。</p>
        <blockquote>“我们保留裂缝的位置，让它提醒使用者这件器物的来路。”</blockquote>
        <figure>
          <svg viewBox="0 0 800 360" role="img" aria-labelledby="figure-title figure-desc">
            <title id="figure-title">三块船木与潮汐标尺示意图</title>
            <desc id="figure-desc">深色木块沿着横向标尺排列，标尺标记低潮、中潮和高潮。</desc>
            <rect width="800" height="360" fill="#dce7df"/>
            <path d="M80 250h640" stroke="#2b5d4d" stroke-width="8"/>
            <rect x="120" y="120" width="130" height="80" fill="#78583b"/>
            <rect x="320" y="150" width="170" height="50" fill="#8b6a48"/>
            <rect x="570" y="90" width="90" height="140" fill="#5f4934"/>
            <text x="80" y="300" font-size="24" fill="#263c34">低潮</text>
            <text x="365" y="300" font-size="24" fill="#263c34">中潮</text>
            <text x="690" y="300" font-size="24" fill="#263c34">高潮</text>
          </svg>
          <figcaption>木料尺寸按潮位批次归档，图注说明关系而不重复正文。</figcaption>
        </figure>
        <h2>材料记录</h2>
        <dl><dt>含水率</dt><dd>低于 12% 后才进入精加工，避免后续开裂。</dd><dt>纹理方向</dt><dd>承重构件让纹理沿主应力方向延伸。</dd></dl>
      </article>
    </div>
  </body>
</html>`,
      '320px 下正文最小字号 16px，标题不超过可用宽度且按词换行；图注与术语说明可读；内嵌 SVG 保持比例；页面无横向滚动。',
    ),
  ),

  'programming:CSS3 · 响应式、容器查询与移动布局：横屏、软键盘与动态视口高度': browserLab(
    '动态视口与横屏操作',
    '用动态视口单位、最小高度和安全区设计移动面板，避免软键盘或横屏时固定高度把操作按钮挤出屏幕。',
    browserTask(
      'html-css-remaining-viewport-practice',
      '制作移动端快速记录面板',
      '让面板使用动态视口高度、可滚动主体和底部固定操作区，并处理横屏空间不足。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>移动快速记录</title>
    <style>
      :root { --ink: #202827; --green: #17644d; --paper: #edf3ef; --line: #aebbb4; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      .app { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 100svh; height: 100dvh; }
      header { padding: max(1rem, env(safe-area-inset-top)) 1rem 1rem; background: #244338; color: white; }
      h1 { margin: 0; font-size: clamp(1.5rem, 6vw, 2.2rem); }
      main { min-height: 0; overflow-y: auto; padding: 1rem; }
      fieldset { min-width: 0; margin: 0 0 1rem; padding: 1rem; background: white; border: 1px solid var(--line); }
      legend { padding: 0 .35rem; font-weight: 850; }
      label { display: block; font-weight: 700; }
      input, textarea { width: 100%; min-height: 2.75rem; margin-top: .3rem; padding: .55rem .65rem; border: 1px solid #82948a; border-radius: 0; font: inherit; }
      textarea { min-height: 8rem; resize: vertical; }
      .actions { display: flex; gap: .6rem; padding: .8rem max(1rem, env(safe-area-inset-right)) max(.8rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); background: white; border-top: 1px solid var(--line); }
      .actions button { flex: 1; min-height: 2.9rem; border: 2px solid var(--green); font: 800 1rem/1 system-ui, sans-serif; }
      .save { color: white; background: var(--green); }
      :focus-visible { outline: 3px solid #c36f18; outline-offset: 2px; }
      .viewport-note { color: #56665f; font-size: .9rem; }
      @media (max-height: 29rem) { .app { height: auto; min-height: 100dvh; } main { overflow: visible; } header { padding-block: .6rem; } textarea { min-height: 5rem; } }
    </style>
  </head>
  <body>
    <div class="app">
      <header><p>巡检记录</p><h1>泵站 07 快速记录</h1></header>
      <main>
        <form id="record-form">
          <fieldset><legend>读数</legend><label for="pressure">出口压力 MPa</label><input id="pressure" inputmode="decimal" type="number" step="0.01" value="0.82"></fieldset>
          <fieldset><legend>现场说明</legend><label for="note">检查结果</label><textarea id="note">阀门位置正常，设备无明显异响。</textarea><p class="viewport-note">软键盘出现时，主体区域独立滚动，保存按钮仍留在底部操作区。</p></fieldset>
        </form>
      </main>
      <footer class="actions"><button type="button">稍后再填</button><button class="save" type="submit" form="record-form">保存记录</button></footer>
    </div>
  </body>
</html>`,
      '390×844 时主体可滚动、底部按钮持续可见；320×568 时内容不被裁切；横屏高度低于 464px 时改为自然文档流；安全区 padding 生效且无横向溢出。',
    ),
    browserTask(
      'html-css-remaining-viewport-apply',
      '设计横屏媒体确认页',
      '为现场照片确认建立顶部信息、可滚动内容与底部双按钮，在高度很低时只保留必要信息。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>现场照片确认</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #e9efec; background: #17221f; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .screen { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 100svh; height: 100dvh; background: #1d2a26; }
      header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; padding: max(.8rem, env(safe-area-inset-top)) 1rem .8rem; border-bottom: 1px solid #52645d; }
      h1 { margin: 0; font-size: clamp(1.25rem, 5vw, 1.8rem); line-height: 1.2; }
      header a { color: #a8e1c8; }
      main { min-height: 0; overflow-y: auto; padding: 1rem; }
      figure { max-width: 50rem; margin: 0 auto; }
      figure > svg { display: block; width: 100%; height: auto; max-height: 45dvh; background: #111a17; }
      figcaption { margin-top: .7rem; color: #b7c5bf; }
      .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: .55rem; margin: 1rem auto 0; max-width: 50rem; padding: 0; list-style: none; }
      .facts li { padding: .7rem; background: #263631; border: 1px solid #52645d; }
      .actions { display: flex; gap: .6rem; padding: .7rem max(1rem, env(safe-area-inset-right)) max(.7rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)); background: #20302b; border-top: 1px solid #52645d; }
      button { flex: 1; min-height: 2.9rem; border: 2px solid #72c59e; padding: .5rem; font: 800 1rem/1 system-ui, sans-serif; }
      .secondary { color: #a8e1c8; background: transparent; }
      .primary { color: #17221f; background: #72c59e; }
      :focus-visible { outline: 3px solid #f0b35b; outline-offset: 3px; }
      @media (max-height: 30rem) { .screen { height: auto; min-height: 100dvh; } main { overflow: visible; } figure > svg { max-height: none; } figcaption { margin-top: .4rem; } }
      @media (max-width: 25rem) { main { padding: .75rem; } .actions { gap: .4rem; } button { font-size: .92rem; } }
    </style>
  </head>
  <body>
    <div class="screen">
      <header><h1>确认现场照片</h1><a href="#back">返回任务</a></header>
      <main>
        <figure>
          <svg viewBox="0 0 900 560" role="img" aria-labelledby="photo-title photo-desc">
            <title id="photo-title">河岸巡检照片示意</title>
            <desc id="photo-desc">河岸巡检点的白色标尺和右侧灰色设备箱。</desc>
            <rect width="900" height="560" fill="#98afae"/>
            <path d="M0 380h900v180H0z" fill="#59786a"/>
            <rect x="210" y="120" width="50" height="300" fill="#f4f0e5"/>
            <g stroke="#3b4742" stroke-width="6"><path d="M210 180h50M210 250h50M210 320h50"/></g>
            <rect x="610" y="250" width="180" height="150" fill="#555f5c"/>
            <rect x="640" y="280" width="55" height="35" fill="#d4b35f"/>
          </svg>
          <figcaption>照片需同时出现标尺读数、设备箱编号和周边地面。</figcaption>
        </figure>
        <ul class="facts"><li>巡检点：HBR-07</li><li>拍摄时间：18:44</li><li>质量：清晰</li></ul>
      </main>
      <footer class="actions"><button class="secondary" type="button">重新拍摄</button><button class="primary" type="button">确认并继续</button></footer>
    </div>
  </body>
</html>`,
      '390×844 和 320×568 下图片、说明与确认按钮都可到达；横屏高度低于 480px 时页面自然滚动且按钮不被固定区遮挡；320px 两个按钮并列不截断文字。',
    ),
  ),

  'programming:CSS3 · 设计 Token、主题与可访问性：焦点、禁用、错误与选中状态': browserLab(
    '焦点、禁用、错误与选中',
    '让组件状态同时通过颜色、文字、边框和辅助技术属性表达，重点保证键盘焦点和禁用原因清楚。',
    browserTask(
      'html-css-remaining-states-practice',
      '建立表单状态矩阵',
      '展示默认、焦点、禁用、错误与选中状态，并确保每种状态有文字说明。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>表单状态矩阵</title>
    <style>
      :root { --ink: #202725; --green: #17644d; --error: #9f352e; --line: #9faeA5; --paper: #eef3ef; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(70rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .states { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: .8rem; }
      article { min-width: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      h2 { margin-top: 0; font-size: 1rem; }
      label { display: block; font-weight: 750; }
      input { width: 100%; min-height: 2.75rem; margin-top: .35rem; padding: .5rem .65rem; border: 2px solid #88968e; border-radius: 0; font: inherit; }
      input:focus-visible { outline: 3px solid #c66c18; outline-offset: 2px; }
      input:disabled { color: #5d6862; background: #e5eae6; cursor: not-allowed; }
      .error input { border-color: var(--error); }
      .message { display: block; margin-top: .35rem; color: #7d271f; font-weight: 700; }
      .choice { display: flex; min-height: 2.75rem; align-items: center; gap: .6rem; }
      .choice input { width: 1.25rem; min-height: 1.25rem; margin: 0; accent-color: var(--green); }
      .choice:has(input:checked) { outline: 2px solid var(--green); outline-offset: 2px; background: #e4f1e9; }
      @media (max-width: 25rem) { main { padding-inline: .75rem; } article { padding: .85rem; } }
    </style>
  </head>
  <body>
    <main>
      <p>设计系统 / 表单状态</p>
      <h1>每个状态都说清楚发生了什么</h1>
      <div class="states">
        <article><h2>默认</h2><label for="default">项目名称</label><input id="default" value="北区泵站"></article>
        <article><h2>键盘焦点</h2><label for="focused">项目名称</label><input id="focused" value="按 Tab 聚焦"><span class="message" style="color:#4d5b54">橙色外轮廓不占用布局宽度。</span></article>
        <article><h2>禁用</h2><label for="disabled">归档编号</label><input id="disabled" value="归档后自动生成" disabled><span class="message" style="color:#4d5b54">完成归档后可用。</span></article>
        <article class="error"><h2>错误</h2><label for="error-field">负责人邮箱</label><input id="error-field" value="lin@" aria-invalid="true" aria-describedby="error-message"><span class="message" id="error-message">请输入完整邮箱地址。</span></article>
        <article><h2>选中</h2><label class="choice"><input type="checkbox" checked> 启用每日巡检提醒</label><span class="message" style="color:#285a45">已选中，状态不只靠颜色。</span></article>
      </div>
    </main>
  </body>
</html>`,
      '五种状态各有可见标题；Tab 到焦点示例出现明确外轮廓；禁用字段有原因说明；错误字段 aria-invalid=true 并关联错误文本；320px 下卡片单列、复选框 44px 行内可点。',
    ),
    browserTask(
      'html-css-remaining-states-apply',
      '设计审批按钮状态',
      '为一个审批动作提供可提交、处理中、成功和失败状态，保留键盘焦点并避免重复点击。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>审批动作状态</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #edf1f3; color: #20282d; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(68rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #293a47; color: white; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.3rem); line-height: 1; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: .8rem; margin-top: 1rem; }
      article { min-width: 0; padding: 1rem; background: white; border: 1px solid #abb7bd; }
      h2 { margin-top: 0; font-size: 1.05rem; }
      button, a.button { display: inline-flex; min-height: 2.85rem; align-items: center; justify-content: center; padding: .6rem 1rem; border: 2px solid #1b6172; font: 800 1rem/1 system-ui, sans-serif; text-decoration: none; }
      .ready { color: white; background: #1b6172; }
      .busy { color: #31525a; background: #e1e9eb; border-style: dashed; cursor: wait; }
      .done { color: #104c34; background: #dff2e7; border-color: #1b704d; }
      .failed { color: #792a24; background: #fff0ee; border-color: #a63c32; }
      .status { display: block; margin-top: .55rem; color: #526168; }
      :focus-visible { outline: 3px solid #c66e18; outline-offset: 3px; }
      a.button { color: white; background: #1b6172; }
      @media (max-width: 25rem) { button, a.button { width: 100%; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header><p>采购审批 / 草稿</p><h1>把动作状态放在控件旁边</h1></header>
      <div class="grid">
        <article><h2>可提交</h2><button class="ready" type="button">提交审批</button><span class="status">资料完整，可以提交。</span></article>
        <article><h2>处理中</h2><button class="busy" type="button" aria-disabled="true">正在提交…</button><span class="status" role="status">请勿重复点击。</span></article>
        <article><h2>成功</h2><p class="done">已提交，编号 AP-8472</p><a class="button" href="#result">查看审批详情</a><span class="status" id="result">成功状态有图标式文字和明确编号。</span></article>
        <article><h2>失败</h2><p class="failed">未提交：审批人不在当前项目组</p><button class="ready" type="button">修改审批人</button><span class="status">错误原因与恢复动作同时出现。</span></article>
      </div>
    </div>
  </body>
</html>`,
      '处理中按钮用文字和虚线边框表达等待；成功与失败不只靠颜色；键盘聚焦所有可操作元素时轮廓不被裁切；320px 下按钮全宽且页面无横向溢出。',
    ),
  ),

  'programming:CSS3 · 组件样式、动效与隔离：组件样式作用域与命名策略': browserLab(
    '作用域与命名边界',
    '通过块级前缀、元素类和状态类隔离组件，避免通用 .title、.active 等命名跨模块污染。',
    browserTask(
      'html-css-remaining-scope-practice',
      '建立卡片组件命名',
      '用 card、card__media、card__title、card--compact 和 data-state 展示清晰的作用域关系。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>卡片组件命名</title>
    <style>
      :root { --ink: #202826; --green: #17634d; --line: #aebbb4; --paper: #edf3ef; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(70rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .geo-card { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); background: white; border: 1px solid var(--line); }
      .geo-card__media { display: grid; min-height: 12rem; place-items: center; background: #dce9e1; color: #174f3d; font-size: 3rem; }
      .geo-card__body { min-width: 0; padding: 1rem; }
      .geo-card__title { margin: 0; font-size: clamp(1.3rem, 4vw, 2rem); line-height: 1.2; }
      .geo-card__meta { color: #56655e; }
      .geo-card__action { display: inline-flex; min-height: 2.75rem; align-items: center; color: #0c5c67; }
      .geo-card--compact .geo-card__media { min-height: 7rem; }
      .geo-card[data-state="verified"] { border-inline-start: .4rem solid var(--green); }
      .other-widget__title { margin-top: 2rem; padding: 1rem; background: #fff3dc; border: 1px solid #c49b63; }
      :focus-visible { outline: 3px solid #c66e18; outline-offset: 3px; }
      @media (max-width: 26rem) { .geo-card { display: block; } .geo-card__media { min-height: 8rem; } }
    </style>
  </head>
  <body>
    <main>
      <p>组件规范 / 命名</p>
      <h1>标题类名只在自己的块内生效</h1>
      <article class="geo-card geo-card--compact" data-state="verified">
        <div class="geo-card__media" aria-hidden="true">◎</div>
        <div class="geo-card__body">
          <h2 class="geo-card__title">东岸潮位站</h2>
          <p class="geo-card__meta">最后校准：2026-11-22 · 状态：已核验</p>
          <a class="geo-card__action" href="#station-detail">查看站点详情</a>
        </div>
      </article>
      <section class="other-widget"><h2 class="other-widget__title">另一个组件标题</h2><p>不同块使用自己的标题类，不会被 card 规则误改。</p></section>
      <p id="station-detail">站点详情区：命名变化不应改变可访问结构。</p>
    </main>
  </body>
</html>`,
      'geo-card 各元素共享同一块前缀，compact 与 data-state 是明确变体；另一个组件标题不受卡片规则影响；320px 下卡片转单列且链接目标可聚焦。',
    ),
    browserTask(
      'html-css-remaining-scope-apply',
      '隔离通知与工单组件',
      '在一个页面放置两组相似组件，用命名空间、局部变量和容器边界防止样式互相覆盖。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>组件作用域隔离</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #20292e; background: #e9eef2; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(74rem, 100%); margin: auto; padding: 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .demo { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      .ops-notice { --component-accent: #1a6650; min-width: 0; padding: 1rem; background: white; border: 1px solid #aeb9b4; border-inline-start: .4rem solid var(--component-accent); }
      .ops-notice__title, .billing-ticket__title { margin: 0 0 .5rem; font-size: 1.2rem; }
      .ops-notice__body { margin: 0; color: #526059; }
      .ops-notice__action { display: inline-flex; min-height: 2.75rem; align-items: center; color: #0d5b48; }
      .billing-ticket { --component-accent: #8a5718; min-width: 0; padding: 1rem; background: #fffaf0; border: 1px solid #c1a476; border-top: .4rem solid var(--component-accent); }
      .billing-ticket__title { color: #64400e; }
      .billing-ticket__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; margin: 0; }
      .billing-ticket__meta div { min-width: 0; padding: .5rem; background: #f3e9d7; }
      .billing-ticket__meta dt { font-weight: 800; }
      .billing-ticket__meta dd { margin: 0; overflow-wrap: anywhere; }
      :focus-visible { outline: 3px solid #c66e18; outline-offset: 3px; }
      @media (max-width: 28rem) { .page { padding-inline: .65rem; } .billing-ticket__meta { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="page">
      <p>设计系统 / 命名空间</p>
      <h1>相似组件也不能共享裸标题选择器</h1>
      <div class="demo">
        <section class="ops-notice">
          <h2 class="ops-notice__title">监控任务正常</h2>
          <p class="ops-notice__body">最近一次探测在 18:45 成功，延迟 84 ms。</p>
          <a class="ops-notice__action" href="#telemetry">查看探测历史</a>
        </section>
        <article class="billing-ticket">
          <h2 class="billing-ticket__title">账单待确认</h2>
          <dl class="billing-ticket__meta"><div><dt>账单号</dt><dd>INV-2026-11842</dd></div><div><dt>金额</dt><dd>¥ 4,280.00</dd></div></dl>
          <p>请由项目负责人确认成本中心。</p>
        </article>
      </div>
      <p id="telemetry">探测历史：两组组件在颜色、边框和标题规则上互不影响。</p>
    </div>
  </body>
</html>`,
      '通知与账单分别使用独立前缀和局部变量；两个 h2 计算样式不同；320px 下账单定义列表单列，长编号换行且页面无横向滚动。',
    ),
  ),

  'programming:CSS3 · 组件样式、动效与隔离：状态变体、数据属性与组合': browserLab(
    '数据属性与状态组合',
    '用 data-state、aria-invalid 和页面级上下文组合组件变体，避免状态类彼此冲突。',
    browserTask(
      'html-css-remaining-variants-practice',
      '建立消息条状态组合',
      '用 data-tone、data-density 与 aria-live 组合信息、警告和紧凑消息。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>消息条状态组合</title>
    <style>
      :root { --ink: #202725; --line: #aebbb4; --green: #17634d; --amber: #96601d; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: #eef3ef; font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(68rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .stack { display: grid; gap: .8rem; }
      .status-message { --tone: var(--green); min-width: 0; padding: 1rem; background: white; border: 1px solid var(--line); border-inline-start: .4rem solid var(--tone); }
      .status-message[data-tone="warning"] { --tone: var(--amber); background: #fff5e4; }
      .status-message[data-density="compact"] { padding: .65rem .8rem; }
      .status-message__title { margin: 0; font-size: 1.08rem; }
      .status-message__body { margin: .25rem 0 0; color: #53615a; }
      .status-message[data-density="compact"] .status-message__body { display: none; }
      .status-message[data-tone="warning"] .status-message__title::before { content: "注意："; }
      .status-message[data-tone="info"] .status-message__title::before { content: "信息："; }
      .matrix { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: 1rem; }
      .matrix code { padding: .35rem .5rem; background: #dfe9e3; overflow-wrap: anywhere; }
      @media (max-width: 25rem) { .status-message { padding: .8rem; } }
    </style>
  </head>
  <body>
    <main>
      <p>组件规范 / 状态属性</p>
      <h1>让状态彼此组合而不互相覆盖</h1>
      <div class="stack">
        <section class="status-message" data-tone="info">
          <h2 class="status-message__title">同步已完成</h2>
          <p class="status-message__body">本次更新 128 条记录，下一次同步在 30 分钟后。</p>
        </section>
        <section class="status-message" data-tone="warning" data-density="compact">
          <h2 class="status-message__title">连接将在 10 分钟后过期</h2>
          <p class="status-message__body">紧凑模式隐藏正文，但可见标题已包含操作含义。</p>
        </section>
      </div>
      <div class="matrix"><code>data-tone="info"</code><code>data-tone="warning"</code><code>data-density="compact"</code></div>
    </main>
  </body>
</html>`,
      '信息与警告状态不同且标题前有文字前缀；紧凑示例隐藏正文但保留完整可见标题；320px 下状态条和 code 标签都能换行，页面无横向溢出。',
    ),
    browserTask(
      'html-css-remaining-variants-apply',
      '设计输入状态组合',
      '结合 aria-invalid、disabled、data-filled 与页面主题展示表单字段的多种状态。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>输入状态属性组合</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #20282e; background: #edf1f3; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(68rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #273c4c; color: white; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      .field { min-width: 0; padding: 1rem; background: white; border: 1px solid #aab6be; }
      .field label { display: block; font-weight: 800; }
      .field input { width: 100%; min-height: 2.8rem; margin-top: .35rem; padding: .55rem .65rem; border: 2px solid #8d9ba3; border-radius: 0; font: inherit; background: white; }
      .field input:disabled { color: #5a656b; background: #e5eaed; cursor: not-allowed; }
      .field[data-filled="true"] { border-top: .35rem solid #1c6a51; }
      .field[data-filled="true"] input { background: #f5fbf7; }
      .field:has(input[aria-invalid="true"]) { border-top-color: #a23c33; background: #fff5f3; }
      .field:has(input[aria-invalid="true"]) input { border-color: #a23c33; }
      .message { display: block; margin-top: .4rem; color: #58666d; font-size: .9rem; }
      .field:has(input[aria-invalid="true"]) .message { color: #7e2b24; font-weight: 700; }
      :focus-visible { outline: 3px solid #c66f18; outline-offset: 3px; }
      :root[data-theme="contrast"] { --surface: white; }
      :root[data-theme="contrast"] .field { border-width: 2px; }
      @media (max-width: 25rem) { .page { padding-inline: .65rem; } .field { padding: .8rem; } }
    </style>
  </head>
  <body data-theme="contrast">
    <div class="page">
      <header><p>供应商资料 / 修订</p><h1>属性组合让输入状态可预测</h1></header>
      <form class="form-grid">
        <div class="field" data-filled="true"><label for="company">公司名称</label><input id="company" value="澄海设备工程有限公司"><span class="message">已填写，边框顶部显示完成提示。</span></div>
        <div class="field"><label for="tax">统一社会信用代码</label><input id="tax" value="" aria-invalid="true" aria-describedby="tax-error"><span class="message" id="tax-error">错误：代码必须为 18 位。</span></div>
        <div class="field"><label for="code">供应商编码</label><input id="code" value="SUP-1842" disabled><span class="message">审核通过后由系统生成，暂不可编辑。</span></div>
        <div class="field" data-filled="true"><label for="contact">联系人</label><input id="contact" value="林岚"><span class="message">可以继续修改。</span></div>
      </form>
    </div>
  </body>
</html>`,
      '填充、错误和禁用字段分别有文字说明与不同边界；aria-invalid 驱动错误视觉；320px 下字段单列，禁用原因和长公司名均不溢出。',
    ),
  ),

  'programming:CSS3 · 组件样式、动效与隔离：对话框、菜单和浮层定位': browserLab(
    '无脚本浮层的定位边界',
    '用 dialog、popover 属性、绝对定位和逻辑 inset 展示浮层，在窄屏内约束宽度并避免遮挡触发点。',
    browserTask(
      'html-css-remaining-layer-practice',
      '设计可关闭的确认对话框',
      '用原生 dialog 展示删除确认，设置最大宽度、内部滚动、明确焦点和移动端边距。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>原生对话框布局</title>
    <style>
      :root { --ink: #202726; --green: #17634d; --paper: #eef3ef; --line: #aab8b0; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(68rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .panel { max-width: 40rem; padding: 1rem; background: white; border: 1px solid var(--line); }
      button { min-height: 2.85rem; padding: .6rem .9rem; border: 2px solid #1a6250; font: 800 1rem/1 system-ui, sans-serif; }
      dialog { width: min(32rem, calc(100% - 2rem)); max-height: min(42rem, calc(100dvh - 2rem)); margin: auto; padding: 0; border: 1px solid #7e8d85; color: var(--ink); background: white; }
      .dialog-head { padding: 1rem; border-bottom: 1px solid var(--line); }
      .dialog-body { max-height: 50dvh; overflow-y: auto; padding: 1rem; }
      .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .6rem; padding: 1rem; border-top: 1px solid var(--line); }
      .confirm { color: white; background: #9b3a31; border-color: #6f2822; }
      .cancel { color: #185f4d; background: white; }
      h2 { margin-top: 0; }
      :focus-visible { outline: 3px solid #c66e18; outline-offset: 3px; }
      @media (max-width: 28rem) { dialog { width: calc(100% - 1.2rem); max-height: calc(100dvh - 1.2rem); } .dialog-actions button { flex: 1; } .dialog-body { max-height: 45dvh; } }
    </style>
  </head>
  <body>
    <main>
      <p>设置 / 项目</p>
      <h1>删除动作需要明确范围</h1>
      <section class="panel"><h2>归档项目</h2><p>归档后仍可恢复，但成员会失去编辑权限。</p></section>
    </main>
    <dialog id="archive-dialog" open aria-labelledby="dialog-title" aria-describedby="dialog-description">
      <div class="dialog-head"><h2 id="dialog-title">归档“河港监测”项目？</h2></div>
      <div class="dialog-body" id="dialog-description"><p>项目将变为只读，活动任务停止提醒。数据会保留 90 天，可从归档列表恢复。</p><p>确认前请完成最后的巡检记录。</p></div>
      <div class="dialog-actions"><button class="cancel" type="button">取消</button><button class="confirm" type="button">确认归档</button></div>
    </dialog>
  </body>
</html>`,
      '此示例用于检查无脚本沙箱中的对话框视觉；dialog 最大高度受动态视口限制，内容区独立滚动；320px 下左右间距 10px、按钮平分宽度，取消与确认不重叠。',
    ),
    browserTask(
      'html-css-remaining-layer-apply',
      '制作菜单定位与翻转',
      '展示一个相对触发按钮的弹出菜单，并用逻辑属性、最大宽度与窄屏 change 定位避免越界。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>弹出菜单定位</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #e8efec; background: #18231f; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
      .page { width: min(72rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #263a32; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1rem; padding: 1rem; background: #22312c; border: 1px solid #566a62; }
      .menu-wrap { position: relative; }
      .trigger { min-height: 2.85rem; padding: .6rem .9rem; border: 2px solid #8ad8b5; color: #e9fff5; background: #1d5c48; font: 800 1rem/1 system-ui, sans-serif; }
      .menu { position: absolute; inset-block-start: calc(100% + .45rem); inset-inline-end: 0; z-index: 3; width: min(20rem, calc(100vw - 2rem)); margin: 0; padding: .35rem; list-style: none; color: #202826; background: white; border: 1px solid #9eaaa4; box-shadow: 0 8px 24px #0a151155; }
      .menu a { display: flex; min-height: 2.7rem; align-items: center; padding: .5rem .65rem; color: #184f3f; }
      .menu a[aria-current="page"] { background: #e2f1e8; outline: 2px solid #185f4a; outline-offset: -3px; }
      .menu-label { display: block; padding: .35rem .65rem; color: #5c6963; font-size: .82rem; font-weight: 800; }
      .content { margin-top: 1rem; padding: 1rem; background: #22312c; border: 1px solid #566a62; }
      :focus-visible { outline: 3px solid #f0b45c; outline-offset: 3px; }
      @media (max-width: 30rem) { .toolbar { align-items: stretch; flex-direction: column; } .menu-wrap { align-self: end; } .menu { position: fixed; inset-inline: .6rem; inset-block-start: auto; inset-block-end: .6rem; width: auto; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header><p>项目菜单 / 定位</p><h1>浮层不能越出视口</h1><p>桌面菜单贴住触发点右侧，窄屏改为底部浮层。</p></header>
      <div class="toolbar">
        <span>当前空间：河港监测</span>
        <div class="menu-wrap">
          <button class="trigger" type="button" popovertarget="project-menu">项目菜单</button>
          <div class="menu" id="project-menu" popover>
            <span class="menu-label">切换项目</span>
            <ul style="margin:0;padding:0;list-style:none">
              <li><a href="#harbor" aria-current="page">河港监测</a></li>
              <li><a href="#water">城市水质</a></li>
              <li><a href="#archived">已归档项目</a></li>
            </ul>
          </div>
        </div>
      </div>
      <section class="content" id="harbor"><h2>河港监测</h2><p>桌面 1280px 下菜单宽 320px；320px 下菜单距左右各 10px，且所有菜单项可键盘聚焦。</p></section>
    </div>
  </body>
</html>`,
      '桌面菜单从触发按钮右对齐且不越界；320px 下菜单固定在底部并保持 10px 外边距；长菜单项可换行，菜单宽度不超过视口，焦点轮廓清晰。',
    ),
  ),

  'programming:CSS3 · 组件样式、动效与隔离：第三方样式覆盖与隔离层': browserLab(
    '层叠隔离与第三方样式',
    '用 @layer 将重置、第三方、应用和覆盖规则分组，让覆盖顺序明确而不依赖 !important。',
    browserTask(
      'html-css-remaining-isolation-practice',
      '把第三方控件放入低优先级层',
      '模拟第三方按钮样式和应用层覆盖，说明层顺序如何改变最终结果。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>第三方样式层隔离</title>
    <style>
      @layer reset, vendor, app;
      @layer reset { button { font: inherit; } }
      @layer vendor { .vendor-button { min-height: 2.7rem; padding: .5rem 2.5rem .5rem .7rem; border: 5px dotted #a02e27; color: #a02e27; background: #ffe9e7; font-weight: 400; } }
      @layer app { .vendor-button { min-height: 2.85rem; padding: .6rem 1rem; border: 2px solid #175f4d; color: white; background: #17644f; font-weight: 800; } }
      :root { --ink: #202826; --paper: #eef3ef; --line: #abb8b1; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.65 system-ui, sans-serif; }
      main { width: min(68rem, 100%); margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem; }
      h1 { font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .demo { padding: 1rem; background: white; border: 1px solid var(--line); }
      .vendor-button { cursor: pointer; }
      .layers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: .45rem; margin-top: 1rem; }
      .layers span { padding: .65rem; background: #dfeae4; border: 1px solid #82978c; text-align: center; }
      :focus-visible { outline: 3px solid #c66e18; outline-offset: 3px; }
      @media (max-width: 25rem) { main { padding-inline: .7rem; } .demo { padding: .75rem; } .vendor-button { width: 100%; } }
    </style>
  </head>
  <body>
    <main>
      <p>样式迁移 / 第三方组件</p>
      <h1>用层顺序接管供应商样式</h1>
      <div class="demo"><button class="vendor-button" type="button">生成审计报告</button></div>
      <p>应用层在 vendor 层之后，因此无需 !important 或加深选择器即可覆盖外观。</p>
      <div class="layers" aria-label="样式层顺序"><span>reset</span><span>vendor</span><span>app</span></div>
    </main>
  </body>
</html>`,
      '按钮最终为绿色实底、2px 实线边框和白色粗体文字；层顺序图显示 reset、vendor、app；320px 下按钮全宽，文字与焦点轮廓不越出卡片。',
    ),
    browserTask(
      'html-css-remaining-isolation-apply',
      '隔离嵌入组件主题',
      '在应用页面中放置两套模拟第三方主题，用局部作用域和 layer 限定颜色变量，避免污染全局按钮。',
      `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>嵌入组件主题隔离</title>
    <style>
      @layer reset, vendor, app;
      @layer reset { *, *::before, *::after { box-sizing: border-box; } body { margin: 0; } }
      @layer app {
        body { color: #20282e; background: #e9eef2; font: 16px/1.65 "Microsoft YaHei", sans-serif; }
        .app-button { min-height: 2.85rem; padding: .6rem .9rem; border: 2px solid #1b5e71; color: white; background: #1b5e71; font: 800 1rem/1 system-ui, sans-serif; }
      }
      .page { width: min(74rem, 100%); margin: auto; padding: 1rem; }
      header { padding: clamp(1.25rem, 5vw, 3rem); background: #273844; color: white; }
      h1 { margin: .2rem 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; margin-top: 1rem; }
      .vendor-panel { --vendor-accent: #17644f; --vendor-surface: #eff8f3; min-width: 0; isolation: isolate; padding: 1rem; background: var(--vendor-surface); border: 1px solid color-mix(in srgb, var(--vendor-accent), white 55%); }
      .vendor-panel[data-vendor="ledger"] { --vendor-accent: #7a4e18; --vendor-surface: #fff8ec; }
      .vendor-panel__title { margin: 0 0 .5rem; color: var(--vendor-accent); font-size: 1.2rem; }
      .vendor-panel__button { min-height: 2.75rem; padding: .5rem .8rem; border: 2px solid var(--vendor-accent); color: var(--vendor-accent); background: white; font: 700 .95rem/1 system-ui, sans-serif; }
      .vendor-panel__meta { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .8rem; }
      .vendor-panel__meta span { padding: .35rem .55rem; background: color-mix(in srgb, var(--vendor-accent), white 85%); }
      :focus-visible { outline: 3px solid #c66e18; outline-offset: 3px; }
      @media (max-width: 27rem) { .page { padding-inline: .65rem; } .vendor-panel, .app-button { width: 100%; } }
    </style>
  </head>
  <body>
    <div class="page">
      <header><p>集成控制台 / 主题</p><h1>嵌入组件只改变自己的变量</h1></header>
      <div class="grid">
        <section class="vendor-panel" data-vendor="harbor">
          <h2 class="vendor-panel__title">港口监测组件</h2>
          <p>此组件使用绿色局部变量，不修改页面按钮。</p>
          <button class="vendor-panel__button" type="button">查看港口数据</button>
          <div class="vendor-panel__meta"><span>12 个站点</span><span>2 个告警</span></div>
        </section>
        <section class="vendor-panel" data-vendor="ledger">
          <h2 class="vendor-panel__title">财务台账组件</h2>
          <p>此组件覆盖同一变量名，颜色只在本面板生效。</p>
          <button class="vendor-panel__button" type="button">打开台账</button>
          <div class="vendor-panel__meta"><span>本月凭证</span><span>待复核 4</span></div>
        </section>
      </div>
      <p><button class="app-button" type="button">应用级测试按钮</button></p>
      <p>应用级按钮仍保持蓝绿色，证明两个嵌入主题没有污染全局。</p>
    </div>
  </body>
</html>`,
      '两个面板共用变量名但主色不同，应用级按钮保持独立配色；320px 下面板单列，按钮全宽，color-mix 计算背景与文字对比清晰且无横向溢出。',
    ),
  ),
};
