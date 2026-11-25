import type {
  LearningV2CodeLab,
  LearningV2CodeLabTask,
} from './v2-types.js';

const BROWSER_SANDBOX = {
  runtimeLabel: 'HTML / CSS 浏览器沙箱',
  installSteps: [
    '代码在隔离的无脚本 iframe 中渲染，不执行 JavaScript，也不访问父页面 DOM。',
    '样式必须内嵌在当前 HTML 单文件中；本组任务不加载图片、字体、媒体或任何外部资源。',
    '分别以 1280、390 和 320 像素宽度打开并检查 checkpoint；页面本身不得横向溢出。',
  ],
  languages: ['html'],
} as const satisfies Pick<
  LearningV2CodeLab,
  'runtimeLabel' | 'installSteps' | 'languages'
>;

type PageInput = {
  readonly key: string;
  readonly title: string;
  readonly style: string;
  readonly body: string;
};

function htmlPage({ key, title, style, body }: PageInput): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="description" content="${title}的 HTML 与 CSS 实践页面">
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      html { min-width: 0; overflow-x: hidden; }
      body { margin: 0; min-width: 0; overflow-wrap: anywhere; }
      h1, h2, h3, p, dl, dd, dt, ul, ol, figure { margin-block-start: 0; }
      a { color: inherit; }
      :focus-visible { outline: 0.2rem solid #f59e0b; outline-offset: 0.2rem; }
${style}
    </style>
  </head>
  <body data-lab="${key}">
${body}
  </body>
</html>`;
}

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

export const LEARNING_CODE_LABS_HTML_CSS_FINAL: Readonly<Record<string, LearningV2CodeLab>> = {
  'programming:CSS3 · Flex、Grid 与页面布局：内容最小宽度和横向滚动边界': browserLab(
    '最小宽度与局部滚动',
    '定位内容最小尺寸，使用 min-width:0、minmax(0,1fr) 和局部滚动隔离溢出。',
    browserTask(
      'html-css-final-minwidth-practice',
      '邮件预览的三栏边界',
      '设置文件夹、邮件列表和阅读区；允许中间列收缩，阅读区内部处理长 URL。',
      htmlPage({
        key: 'minwidth-practice',
        title: '邮件工作区',
        style: `
      :root { --nav: #23323d; --rail: #e7edf0; --list: #f7f9fa; --ink: #1d2a31; --line: #aebbc2; --blue: #176b87; }
      body { color: var(--ink); background: #dce5e8; font: 1rem/1.55 system-ui, sans-serif; }
      .mail { display: grid; grid-template-columns: 12rem minmax(15rem, 22rem) minmax(0, 1fr); min-block-size: 100vh; }
      .folders { padding: 1rem; color: white; background: var(--nav); }
      .folders ul { padding: 0; list-style: none; }
      .folders a { display: flex; min-block-size: 2.75rem; align-items: center; }
      .messages { min-inline-size: 0; padding: 0.8rem; background: var(--rail); border-inline-end: 1px solid var(--line); }
      .messages h1 { font-size: 1.3rem; }
      .messages article { min-inline-size: 0; padding: 0.8rem; background: white; border: 1px solid var(--line); }
      .messages article + article { margin-block-start: 0.5rem; }
      .messages h2, .messages p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .reader { min-inline-size: 0; padding: clamp(1rem, 4vw, 3rem); background: #fff; }
      .reader h2 { line-height: 1.2; }
      .url { max-inline-size: 100%; overflow-x: auto; padding: 0.75rem; font-family: ui-monospace, monospace; white-space: nowrap; background: var(--list); border: 1px solid var(--line); }
      .field { display: grid; gap: 0.2rem; }
      @media (max-width: 50rem) {
        .mail { grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr); }
        .reader { grid-column: 1 / -1; min-block-size: 20rem; }
      }
      @media (max-width: 30rem) {
        .mail { grid-template-columns: 1fr; }
        .folders ul { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .folders a { padding-inline: 0.5rem; background: #354955; }
        .reader { grid-column: auto; }
      }
    `,
        body: `    <main class="mail">
      <nav class="folders" aria-label="邮件文件夹"><h2>邮箱</h2><ul><li><a href="#inbox">收件箱 12</a></li><li><a href="#sent">已发送</a></li><li><a href="#drafts">草稿 3</a></li></ul></nav>
      <section class="messages" id="inbox" aria-label="收件箱">
        <h1>收件箱</h1>
        <article><h2>季度数据库容量复核</h2><p>请确认 12 月扩容窗口与回滚条件。</p></article>
        <article><h2>发布评审所需材料</h2><p>接口变更说明已更新到共享目录。</p></article>
        <article><h2>现场巡检复盘安排</h2><p>周三下午三点，会议室东岸。</p></article>
        <p id="sent"><strong>已发送：</strong>最近 7 天没有待追踪邮件。</p>
        <p id="drafts"><strong>草稿：</strong>3 封邮件等待补充收件人或附件。</p>
      </section>
      <article class="reader">
        <p>平台工程组 · 09:42</p>
        <h2>季度数据库容量复核</h2>
        <p>订单与库存主库的峰值连接数接近预算上限。请确认扩容窗口，并补充回滚与验证步骤。</p>
        <div class="field"><strong>监控地址</strong><p class="url">/monitor/databases/order-primary/capacity?window=quarter&amp;cluster=shanghai-production-2026</p></div>
        <p>回复时请同时写明计划窗口、负责人和停止条件。</p>
      </article>
    </main>`,
      }),
      '1280px 三栏正常分配；中间邮件列表的 h2 和 p 使用省略号不撑宽；长监控地址只在自身 .url 内滚动；390px 和 320px 下页面 document 无横向溢出。',
    ),
    browserTask(
      'html-css-final-minwidth-apply',
      '审计日志的窄屏数据表',
      '让时间、操作者、动作和结果四列保持可读；宽屏一行显示，窄屏按字段拆行。',
      htmlPage({
        key: 'minwidth-apply',
        title: '审计日志',
        style: `
      :root { --ink: #202823; --green: #245b45; --paper: #f3f6f2; --line: #aab7ad; --amber: #8a5413; --red: #8e3030; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.55 ui-monospace, "Cascadia Code", monospace; }
      main { width: min(68rem, 100%); margin-inline: auto; padding: clamp(0.7rem, 4vw, 3rem); }
      header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem 1rem; }
      h1 { color: var(--green); font-size: clamp(1.8rem, 6vw, 3.4rem); line-height: 1.1; }
      .filter { padding: 0.6rem 0.8rem; background: #dde9e0; border: 1px solid var(--line); }
      .logs { border: 1px solid var(--line); background: white; }
      .row { display: grid; grid-template-columns: 12rem minmax(0, 1fr) minmax(10rem, 1fr) 7rem; gap: 1rem; align-items: center; padding: 0.8rem 1rem; }
      .row + .row { border-top: 1px solid var(--line); }
      .row > * { min-inline-size: 0; overflow-wrap: anywhere; }
      .result { padding: 0.2rem 0.45rem; border: 1px solid currentColor; text-align: center; }
      .deny { color: var(--red); }
      .warn { color: var(--amber); }
      .allow { color: var(--green); }
      .note { padding: 0.8rem; border-inline-start: 0.3rem solid var(--green); background: #e4eee7; }
      @media (max-width: 48rem) {
        .row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .result { justify-self: start; }
      }
      @media (max-width: 28rem) { .row { grid-template-columns: 1fr; gap: 0.35rem; } }
    `,
        body: `    <main>
      <header><div><p>安全运营中心</p><h1>审计日志</h1></div><span class="filter">最近 24 小时</span></header>
      <section class="logs" aria-label="审计事件">
        <article class="row"><time datetime="2026-11-24T20:14:00+08:00">2026-11-24 20:14</time><span>lin.chen@example.com</span><strong>导出客户清单</strong><span class="result allow">允许</span></article>
        <article class="row"><time datetime="2026-11-24T19:52:00+08:00">2026-11-24 19:52</time><span>contractor-038@example.com</span><strong>修改生产环境密钥</strong><span class="result deny">拒绝</span></article>
        <article class="row"><time datetime="2026-11-24T19:21:00+08:00">2026-11-24 19:21</time><span>zhou.ning@example.com</span><strong>重试失败的任务批次</strong><span class="result warn">待复核</span></article>
      </section>
      <p class="note">长账号、动作和结果字段全部允许在自身单元格内换行。</p>
    </main>`,
      }),
      '1280px 四列对齐；390px 每行改为两列；320px 每行改为单列且长邮箱可在任意位置换行；结果标签不被裁切；页面 scrollWidth 与 clientWidth 相等。',
    ),
  ),

  'programming:CSS3 · 响应式、容器查询与移动布局：移动布局截图与溢出回归': browserLab(
    '截图前的几何回归',
    '在 1280、390、320 三档检查页面宽度、触控尺寸和内容换行，用可观察结构替代只看截图。',
    browserTask(
      'html-css-final-mobile-audit-practice',
      '移动端客户档案',
      '制作头像、客户信息、联系方式和行动按钮；窄屏重排但按钮至少 44px，长邮箱可断行。',
      htmlPage({
        key: 'mobile-audit-practice',
        title: '客户档案',
        style: `
      :root { --ink: #1d2b2a; --paper: #edf4ef; --panel: #fffdf8; --green: #17644e; --orange: #a8561f; --line: #aab8ae; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(56rem, 100%); margin-inline: auto; padding: clamp(0.7rem, 4vw, 3rem); }
      .profile { display: grid; grid-template-columns: 8rem minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: clamp(1rem, 4vw, 2rem); background: var(--panel); border: 1px solid var(--line); box-shadow: 0 0.7rem 2rem #3555441a; }
      .avatar { display: grid; place-items: center; inline-size: 8rem; max-inline-size: 100%; aspect-ratio: 1; color: white; background: var(--green); font-size: clamp(2rem, 8vw, 4rem); font-weight: 900; }
      .identity { min-inline-size: 0; }
      .identity h1 { margin: 0; color: var(--green); font-size: clamp(1.8rem, 7vw, 3.8rem); line-height: 1.08; }
      .identity p { overflow-wrap: anywhere; }
      .actions { display: grid; gap: 0.5rem; }
      .actions a, .actions button { display: inline-flex; min-block-size: 2.9rem; align-items: center; justify-content: center; padding-inline: 0.8rem; border: 2px solid var(--green); background: white; color: var(--green); font: inherit; font-weight: 800; text-decoration: none; }
      .actions .primary { color: white; background: var(--green); }
      .details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-block-start: 1rem; }
      .details section { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.4rem 0.8rem; }
      dt { font-weight: 800; } dd { margin: 0; overflow-wrap: anywhere; }
      @media (max-width: 42rem) { .profile { grid-template-columns: 6rem minmax(0, 1fr); } .avatar { inline-size: 6rem; } .actions { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 27rem) { .profile { grid-template-columns: 1fr; } .avatar { inline-size: 4.5rem; } .actions, .details { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <article class="profile">
        <div class="avatar" aria-hidden="true">滨</div>
        <div class="identity"><p>企业客户 · 华东</p><h1>滨河物流有限公司</h1><p>customer-success-east@binhe-logistics.example.com</p></div>
        <div class="actions"><a class="primary" href="#contact">发起服务</a><button type="button">查看合同</button></div>
      </article>
      <section class="details">
        <section><h2>联系人</h2><dl><dt>姓名</dt><dd>周宁</dd><dt>电话</dt><dd>138 0000 2418</dd><dt>时段</dt><dd>工作日 09:00–17:30</dd></dl></section>
        <section><h2>服务范围</h2><dl><dt>仓库</dt><dd>东港、临港、北岸</dd><dt>设备</dt><dd>温控与门禁共 42 台</dd><dt>响应</dt><dd>高优先级 15 分钟</dd></dl></section>
      </section>
      <p id="contact">服务申请会发送给当前客户成功经理。</p>
    </main>`,
      }),
      '三档视口页面 scrollWidth 均等于 clientWidth；320px 头像、身份和按钮单列；所有按钮高度至少 44px；长邮箱在容器内断行；Tab 焦点按身份信息后的两个动作依次移动。',
    ),
    browserTask(
      'html-css-final-mobile-audit-apply',
      '移动端资产盘点',
      '制作带统计、筛选、资产行和状态标记的盘点页；390px 保持两列信息，320px 转为单列。',
      htmlPage({
        key: 'mobile-audit-apply',
        title: '设备资产盘点',
        style: `
      :root { --ink: #20262d; --paper: #f2f4f6; --panel: #ffffff; --navy: #223b55; --blue: #276b8b; --amber: #8e5810; --red: #933a38; --line: #aeb8c1; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.55 system-ui, sans-serif; }
      main { width: min(66rem, 100%); margin-inline: auto; padding: clamp(0.65rem, 3vw, 2rem); }
      header { padding: clamp(1rem, 4vw, 2rem); color: white; background: var(--navy); }
      h1 { margin: 0; font-size: clamp(1.8rem, 6vw, 3.5rem); line-height: 1.04; }
      .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; margin-block: 0.8rem; }
      .summary div { min-inline-size: 0; padding: 0.8rem; background: var(--panel); border: 1px solid var(--line); }
      .summary strong { display: block; color: var(--blue); font-size: clamp(1.5rem, 5vw, 2.2rem); line-height: 1.1; }
      .filters { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-block: 0.8rem; }
      .filters button { min-height: 2.75rem; padding-inline: 0.8rem; border: 1px solid #87969f; background: white; font: inherit; }
      .filters button[aria-pressed="true"] { color: white; background: var(--blue); }
      .assets { display: grid; gap: 0.6rem; }
      .asset { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto; gap: 0.7rem 1rem; align-items: center; min-inline-size: 0; padding: 0.85rem 1rem; background: var(--panel); border: 1px solid var(--line); }
      .asset > * { min-inline-size: 0; overflow-wrap: anywhere; }
      .asset h2 { margin: 0; font-size: 1.05rem; }
      .status { padding: 0.25rem 0.5rem; border: 1px solid currentColor; color: var(--amber); text-align: center; }
      .status.failed { color: var(--red); }
      @media (max-width: 38rem) { .asset { grid-template-columns: minmax(0, 1fr) auto; } .asset p { grid-column: 1 / -1; } }
      @media (max-width: 26rem) { .summary { grid-template-columns: 1fr; } .asset { grid-template-columns: 1fr; } .status { justify-self: start; } }
    `,
        body: `    <main>
      <header><p>北岸仓库 · 2026 年 11 月</p><h1>设备资产盘点</h1></header>
      <section class="summary" aria-label="盘点概况"><div><strong>42</strong><span>设备总数</span></div><div><strong>39</strong><span>已完成核对</span></div><div><strong>3</strong><span>等待复核</span></div></section>
      <div class="filters" aria-label="资产筛选"><button type="button" aria-pressed="true">全部</button><button type="button" aria-pressed="false">温控</button><button type="button" aria-pressed="false">门禁</button></div>
      <section class="assets" aria-label="设备列表">
        <article class="asset"><h2>TC-04 冷库温控器</h2><p>东区 A 库 · 最近上报 20:16</p><span class="status">待复核</span></article>
        <article class="asset"><h2>AC-18 仓库门禁控制器</h2><p>二号门 · 最近上报 20:18</p><span class="status failed">离线</span></article>
        <article class="asset"><h2>TC-09 冷库温控器</h2><p>西区 B 库 · 最近上报 20:19</p><span class="status">已核对</span></article>
      </section>
    </main>`,
      }),
      '1280px 资产三列字段对齐；390px 资产状态保持右侧且说明跨列；320px 统计与资产全部单列；状态文字和长设备名不裁切；页面三档均无横向滚动。',
    ),
  ),

  'programming:CSS3 · 设计 Token、主题与可访问性：字体比例、行高与排版节奏': browserLab(
    '排版尺度与信息节奏',
    '建立字体比例、行高和段落间距，使长文、标签和紧凑数据面板各自可读。',
    browserTask(
      'html-css-final-typescale-practice',
      '研究报告排版',
      '用语义字号变量构建标题、副标题、正文、图注和标签；保持阅读行宽与一致垂直节奏。',
      htmlPage({
        key: 'typescale-practice',
        title: '城市夜间照明研究',
        style: `
      :root {
        --ink: #202421;
        --paper: #f4f1e8;
        --forest: #315a48;
        --rust: #a9552d;
        --rule: #b8b1a3;
        --step--1: clamp(0.82rem, 0.78rem + 0.2vw, 0.95rem);
        --step-0: clamp(1rem, 0.95rem + 0.25vw, 1.12rem);
        --step-1: clamp(1.2rem, 1.08rem + 0.55vw, 1.55rem);
        --step-2: clamp(1.5rem, 1.25rem + 1vw, 2.2rem);
        --step-4: clamp(2.3rem, 1.5rem + 4vw, 5.2rem);
        --leading: 1.72;
      }
      body { color: var(--ink); background: var(--paper); font: var(--step-0)/var(--leading) Georgia, "Noto Serif SC", serif; }
      main { width: min(100% - 2rem, 64rem); margin-inline: auto; padding-block: clamp(1.5rem, 6vw, 5rem); }
      article { max-inline-size: 68ch; margin-inline: auto; }
      .eyebrow { color: var(--rust); font: 800 var(--step--1)/1.3 system-ui, sans-serif; letter-spacing: 0.08em; }
      h1 { max-inline-size: 17ch; margin-block: 0.5rem 1rem; color: var(--forest); font-size: var(--step-4); line-height: 1.02; }
      .abstract { font-size: var(--step-1); line-height: 1.55; }
      h2 { margin-block-start: 2.2rem; color: var(--forest); font-size: var(--step-2); line-height: 1.18; }
      p + p { margin-block-start: 1em; }
      .byline { padding-block: 0.7rem; border-block: 1px solid var(--rule); color: #5e625b; font: var(--step--1)/1.5 system-ui, sans-serif; }
      blockquote { margin: 1.5rem 0; padding: 1rem 0 1rem 1rem; border-inline-start: 0.3rem solid var(--rust); font-size: var(--step-1); line-height: 1.5; }
      .caption { color: #5b615c; font: var(--step--1)/1.5 system-ui, sans-serif; }
      @media (max-width: 30rem) { main { width: calc(100% - 1rem); } h1 { max-inline-size: 100%; } }
    `,
        body: `    <main>
      <article>
        <p class="eyebrow">城市基础设施研究 · 摘要</p>
        <h1>夜间照明如何影响步行安全感</h1>
        <p class="byline">研究团队：公共空间观测组 · 数据周期：2026 年 9–11 月</p>
        <p class="abstract">本报告比较连续照明、点状高亮和低色温导向照明三种方案，关注照度、眩光与边界识别，而非只比较灯具数量。</p>
        <h2>观察方法</h2>
        <p>研究选择四条夜间步行路径，在平日与周末各进行三轮观测。记录者分别从入口向中心行走，在不看测量仪的情况下描述能辨认的边界与远处行人。</p>
        <blockquote>“看得见”不等于“看得舒适”；过亮灯箱会把视线从路面吸引到广告表面。</blockquote>
        <h2>主要发现</h2>
        <p>连续但较低的照明更有助于辨认路面高差，统一色温也让阴影不会突然改变。公交站附近仍需要局部高亮，但应限制眩光并保留行人面部识别光线。</p>
        <p class="caption">图注：三段路径均使用语义字号变量，正文行高保持 1.72，脚注降一级但不低于可读下限。</p>
      </article>
    </main>`,
      }),
      '标题、摘要、正文和说明文字形成至少三级视觉层次；正文行宽不超过 68ch；320px 下字号和行高稳定、无横向滚动；标题不超过容器，段落间距一致。',
    ),
    browserTask(
      'html-css-final-typescale-apply',
      '紧凑运营面板',
      '设计监控面板的标签、数值、时间和状态字号；用 tabular-nums 和信息密度保持与长文不同的节奏。',
      htmlPage({
        key: 'typescale-apply',
        title: '集群容量面板',
        style: `
      :root {
        --ink: #e8eef0;
        --muted: #aab8bd;
        --bg: #101c22;
        --panel: #1a2a31;
        --line: #46606a;
        --cyan: #6fd4d9;
        --amber: #f0b85b;
        --label: 0.78rem;
        --body: 0.96rem;
        --metric: clamp(2.1rem, 6vw, 3.7rem);
        --section: clamp(1.25rem, 4vw, 1.8rem);
      }
      body { color: var(--ink); background: var(--bg); font: var(--body)/1.55 ui-monospace, "Cascadia Code", monospace; }
      main { width: min(72rem, 100%); margin-inline: auto; padding: clamp(0.7rem, 4vw, 2.5rem); }
      header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem 1rem; }
      h1 { margin: 0; color: var(--cyan); font-size: var(--section); }
      .eyebrow { color: var(--amber); font-size: var(--label); letter-spacing: 0.07em; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; margin-block-start: 1rem; }
      .metric { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .metric .label { color: var(--muted); font-size: var(--label); }
      .metric strong { display: block; margin-block: 0.25rem; color: var(--cyan); font-size: var(--metric); line-height: 1; font-variant-numeric: tabular-nums; }
      .metric .unit { color: var(--muted); font-size: var(--body); }
      .log { margin-block-start: 0.8rem; border: 1px solid var(--line); }
      .log h2 { margin: 0; padding: 0.75rem; color: var(--ink); font-size: var(--body); background: #243842; }
      .row { display: grid; grid-template-columns: 8rem minmax(0, 1fr) auto; gap: 0.8rem; padding: 0.65rem 0.75rem; border-top: 1px solid var(--line); }
      time { color: var(--muted); font-variant-numeric: tabular-nums; }
      .row strong { color: var(--amber); }
      @media (max-width: 44rem) { .grid { grid-template-columns: 1fr; } }
      @media (max-width: 27rem) { .row { grid-template-columns: 1fr; gap: 0.2rem; } }
    `,
        body: `    <main>
      <header><div><p class="eyebrow">PRODUCTION / SHANGHAI</p><h1>集群容量</h1></div><time datetime="2026-11-24T20:40:00+08:00">20:40:00</time></header>
      <section class="grid" aria-label="集群指标">
        <article class="metric"><span class="label">CPU 请求率</span><strong>68<span class="unit">%</span></strong><span>过去 15 分钟</span></article>
        <article class="metric"><span class="label">内存使用</span><strong>42.7<span class="unit">GB</span></strong><span>上限 64 GB</span></article>
        <article class="metric"><span class="label">队列积压</span><strong>184<span class="unit">条</span></strong><span>处理速率稳定</span></article>
      </section>
      <section class="log"><h2>最近事件</h2><div class="row"><time>20:38:12</time><span>容量检查完成，无阻塞项。</span><strong>正常</strong></div><div class="row"><time>20:31:40</time><span>批处理节点完成滚动重启。</span><strong>完成</strong></div><div class="row"><time>20:24:08</time><span>节点 pool-b-03 连接数偏高。</span><strong>观察</strong></div></section>
    </main>`,
      }),
      '指标卡数字采用等宽数字并保持单行；标签和正文层次清楚；390px 指标单列，320px 事件行单列；时间和状态不截断；页面无横向滚动。',
    ),
  ),

  'programming:CSS3 · 设计 Token、主题与可访问性：间距、圆角、阴影与视觉层级': browserLab(
    '空间与层级系统',
    '用有限间距、圆角和阴影 Token 建立清晰层级，避免每个组件独立发明视觉数值。',
    browserTask(
      'html-css-final-spacing-practice',
      '账单卡片层级',
      '定义 4、8、12、20、32 像素的间距尺度，建立平面卡、选中卡和浮层卡三级阴影。',
      htmlPage({
        key: 'spacing-practice',
        title: '订阅账单',
        style: `
      :root {
        --ink: #1f2930;
        --paper: #f3f5f4;
        --card: #fff;
        --teal: #176b60;
        --line: #b2beb8;
        --space-1: 0.25rem;
        --space-2: 0.5rem;
        --space-3: 0.75rem;
        --space-4: 1.25rem;
        --space-5: 2rem;
        --radius-1: 0.25rem;
        --radius-2: 0.5rem;
        --shadow-1: 0 0.15rem 0.4rem #2439311a;
        --shadow-2: 0 0.6rem 1.5rem #24393124;
        --shadow-3: 0 1.3rem 3rem #24393133;
      }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(62rem, 100%); margin-inline: auto; padding: var(--space-5) var(--space-3); }
      h1 { font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .stack { display: grid; gap: var(--space-4); }
      .invoice, .selected, .floating { padding: var(--space-4); background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-2); }
      .invoice { box-shadow: var(--shadow-1); }
      .selected { border: 2px solid var(--teal); box-shadow: var(--shadow-2); }
      .floating { position: relative; z-index: 2; margin-inline: var(--space-3); box-shadow: var(--shadow-3); }
      .row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); padding-block: var(--space-2); border-bottom: 1px solid #d6ddd9; }
      .row:last-child { border-bottom: 0; }
      .badge { padding: var(--space-1) var(--space-2); border-radius: 999px; color: white; background: var(--teal); font-size: 0.82rem; font-weight: 800; }
      .note { padding: var(--space-3); border-inline-start: 0.25rem solid #a66019; border-radius: var(--radius-1); background: #fff7e8; }
      code { overflow-wrap: anywhere; }
    `,
        body: `    <main>
      <p>账户 · 团队版</p>
      <h1>订阅账单</h1>
      <div class="stack">
        <article class="invoice"><div class="row"><strong>11 月团队席位</strong><span>18 × ¥39</span></div><div class="row"><strong>存储附加包</strong><span>¥120</span></div><div class="row"><strong>合计</strong><strong>¥822</strong></div></article>
        <article class="selected"><span class="badge">当前方案</span><h2>团队版 · 年付</h2><p>下一账期：2026-12-24。账单在到期前 7 天发送。</p></article>
        <aside class="floating"><h2>付款提醒</h2><p>企业转账到账后，发票状态会在一个工作日内更新。</p></aside>
      </div>
      <p class="note"><code>--space-*</code> 只用于内部间距，<code>--shadow-*</code> 只表达层级，不使用负值或任意小数。</p>
    </main>`,
      }),
      '三张卡分别使用一级、二级、三级阴影且层级可辨；卡片间距来自统一 Token；320px 下金额行正常换行且浮层不超出容器；页面无横向溢出。',
    ),
    browserTask(
      'html-css-final-spacing-apply',
      '设置分组与危险区域',
      '用间距、边框和留白区分普通设置、危险操作和帮助说明；危险区不需要巨大红色背景也能引起注意。',
      htmlPage({
        key: 'spacing-apply',
        title: '工作区安全设置',
        style: `
      :root {
        --ink: #272622;
        --paper: #f4f0e7;
        --panel: #fffdf8;
        --brown: #5c4430;
        --orange: #ad5a20;
        --red: #8e302f;
        --line: #b6aa9b;
        --s1: 0.35rem;
        --s2: 0.7rem;
        --s3: 1.1rem;
        --s4: 1.8rem;
        --s5: 3rem;
        --r1: 0.3rem;
        --r2: 0.65rem;
      }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 Georgia, "Noto Serif SC", serif; }
      main { width: min(48rem, 100%); margin-inline: auto; padding: var(--s5) var(--s2); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.02; }
      .stack { display: grid; gap: var(--s3); }
      section { padding: var(--s3); background: var(--panel); border: 1px solid var(--line); border-radius: var(--r2); }
      section h2 { margin-block-end: var(--s2); }
      .field { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s2); padding-block: var(--s2); border-top: 1px solid #ded5c8; }
      .field:first-of-type { border-top: 0; }
      label { font-weight: 800; }
      select, button { min-height: 2.8rem; padding-inline: var(--s2); border: 1px solid #8e8173; border-radius: var(--r1); background: white; font: inherit; }
      .danger { border: 2px solid #c58d89; border-radius: var(--r2); padding: var(--s3); background: #fff6f4; }
      .danger h2, .danger strong { color: var(--red); }
      .danger button { color: white; background: var(--red); border-color: var(--red); font-weight: 800; }
      .help { padding: var(--s2); border-inline-start: 0.3rem solid var(--orange); border-radius: var(--r1); background: #fff5de; }
      @media (max-width: 30rem) { main { padding-block: var(--s4); } .field { align-items: stretch; } select, button { inline-size: 100%; } }
    `,
        body: `    <main>
      <p>工作区 · 北岸数据组</p>
      <h1>安全与通知</h1>
      <div class="stack">
        <section>
          <h2>常规设置</h2>
          <div class="field"><label for="session">登录保持时间</label><select id="session"><option>8 小时</option><option>24 小时</option></select></div>
          <div class="field"><label for="notify">安全邮件</label><select id="notify"><option>立即发送</option><option>每日汇总</option></select></div>
        </section>
        <section class="danger">
          <h2>危险区域</h2>
          <div class="field"><div><strong>解散工作区</strong><p>所有项目会进入 30 天回收站。</p></div><button type="button">开始解散</button></div>
        </section>
        <p class="help">高影响操作通过文字、边界和独立间距表达，而不是只依赖红色背景。</p>
      </div>
    </main>`,
      }),
      '常规区、危险区和帮助说明之间有统一层级间距；危险区使用清楚标题与按钮，不仅靠背景；320px 下选择和按钮满宽；页面无横向滚动且焦点可见。',
    ),
  ),

  'programming:CSS3 · 组件样式、动效与隔离：组件视觉回归与交互状态': browserLab(
    '交互状态视觉回归',
    '把默认、悬停、焦点、禁用和错误状态纳入同一组件审查，并用几何断言补足截图。',
    browserTask(
      'html-css-final-visual-regression-practice',
      '按钮状态矩阵',
      '展示主按钮、危险按钮和禁用按钮的默认、焦点与悬停意图；焦点必须可见且不改变布局。',
      htmlPage({
        key: 'visual-regression-practice',
        title: '按钮状态矩阵',
        style: `
      :root { --ink: #1e2930; --paper: #eef3f4; --blue: #145f78; --red: #913b38; --line: #aab6bb; --focus: #d88a24; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(62rem, 100%); margin-inline: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { color: var(--blue); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.04; }
      .matrix { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
      .cell { display: grid; gap: 0.6rem; align-content: start; min-inline-size: 0; padding: 1rem; background: white; border: 1px solid var(--line); }
      .label { color: #50626a; font-size: 0.85rem; font-weight: 800; }
      .button { display: inline-flex; min-block-size: 2.9rem; align-items: center; justify-content: center; padding: 0.6rem 0.9rem; border: 2px solid var(--blue); color: white; background: var(--blue); font: inherit; font-weight: 850; }
      .button[data-tone="danger"] { background: var(--red); border-color: var(--red); }
      .button[data-state="hover"] { background: #10485c; box-shadow: 0 0.3rem 0.8rem #102d3940; }
      .button[data-state="focus"] { outline: 0.25rem solid var(--focus); outline-offset: 0.2rem; }
      .button:disabled { color: #565e62; background: #dfe4e5; border: 2px dashed #8e999e; }
      .geometry { margin-block-start: 1rem; padding: 0.8rem; background: #e4ecee; border-inline-start: 0.3rem solid var(--blue); font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
      @media (max-width: 40rem) { .matrix { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>组件审查 · Button / 2026.11.24</p>
      <h1>按钮状态矩阵</h1>
      <section class="matrix" aria-label="按钮状态示例">
        <div class="cell"><span class="label">主按钮</span><button class="button" type="button">默认</button><button class="button" data-state="hover" type="button">静态悬停</button><button class="button" data-state="focus" type="button">焦点</button></div>
        <div class="cell"><span class="label">危险按钮</span><button class="button" data-tone="danger" type="button">删除</button><button class="button" data-tone="danger" data-state="hover" type="button">悬停删除</button><button class="button" data-tone="danger" data-state="focus" type="button">焦点删除</button></div>
        <div class="cell"><span class="label">不可用</span><button class="button" type="button" disabled>保存中</button><p>禁用按钮仍保留原宽度与文字。</p></div>
      </section>
      <p class="geometry">geometry: height=46px; focusOffset=3px; layoutShift=0; pageOverflow=0</p>
    </main>`,
      }),
      '每个按钮高度一致；焦点轮廓在按钮外侧且不推动相邻元素；危险按钮有独立色；禁用态使用虚线；390px 与 320px 状态下矩阵单列且页面无横向滚动。',
    ),
    browserTask(
      'html-css-final-visual-regression-apply',
      '对话框状态与关键几何',
      '展示加载、错误和成功三种对话框头部状态，并记录按钮、宽度与内容高度证据。',
      htmlPage({
        key: 'visual-regression-apply',
        title: '导出任务对话框',
        style: `
      :root { --ink: #272522; --paper: #f3efe7; --panel: #fffdf8; --brown: #5f4534; --orange: #a14e20; --green: #21634a; --red: #913a36; --line: #b2a596; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 Georgia, "Noto Serif SC", serif; }
      main { width: min(66rem, 100%); margin-inline: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .states { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
      .dialog { min-inline-size: 0; padding: 0; background: var(--panel); border: 1px solid #7f756b; box-shadow: 0 0.8rem 2rem #57433124; }
      .head { padding: 0.8rem 1rem; border-bottom: 1px solid var(--line); }
      .head h2 { margin: 0; font-size: 1.15rem; }
      .status { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0; font: 0.82rem/1.4 system-ui, sans-serif; font-weight: 850; }
      .status::before { content: "•"; }
      .body { padding: 1rem; }
      .actions { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.8rem; border-top: 1px solid var(--line); }
      .actions button { min-height: 2.75rem; padding-inline: 0.8rem; border: 1px solid #7c736b; background: white; font: inherit; }
      .actions .primary { color: white; background: var(--brown); border-color: var(--brown); }
      .loading .status { color: var(--orange); } .loading .track { block-size: 0.55rem; margin-block-start: 0.8rem; background: #e3d8ca; } .loading .track span { display: block; inline-size: 62%; block-size: 100%; background: var(--orange); }
      .error .status { color: var(--red); } .error .status::before { content: "!"; }
      .success .status { color: var(--green); } .success .status::before { content: "✓"; }
      .metrics { margin-block-start: 1rem; padding: 0.8rem; background: #e9ece7; border-inline-start: 0.3rem solid var(--brown); font: 0.8rem/1.55 ui-monospace, monospace; overflow-wrap: anywhere; }
      @media (max-width: 44rem) { .states { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>导出中心 · 组件快照</p>
      <h1>三种对话框状态</h1>
      <section class="states" aria-label="导出对话框状态">
        <article class="dialog loading"><div class="head"><h2>正在导出订单</h2><p class="status">已处理 62%</p></div><div class="body"><p>预计还需 18 秒，请不要关闭窗口。</p><div class="track"><span></span></div></div><div class="actions"><button type="button">取消</button></div></article>
        <article class="dialog error"><div class="head"><h2>导出失败</h2><p class="status">网络连接中断</p></div><div class="body"><p>已生成的分片会保留 24 小时，可以重新尝试。</p></div><div class="actions"><button type="button">关闭</button><button class="primary" type="button">重试</button></div></article>
        <article class="dialog success"><div class="head"><h2>导出完成</h2><p class="status">12,480 条记录</p></div><div class="body"><p>文件已放入团队下载目录。</p></div><div class="actions"><button class="primary" type="button">打开文件</button></div></article>
      </section>
      <p class="metrics">dialogWidth=100%; actionHeight=44px; headerEdge=1px; pageOverflow=0</p>
    </main>`,
      }),
      '加载、错误、成功三种状态有不同文字前缀与语义色；每个动作按钮至少 44px；390px 与 320px 对话框单列；状态标题与几何指标不溢出，页面无横向滚动。',
    ),
  ),

  'programming:CSS3 · 性能、工具链与企业设计系统：选择器、布局、绘制与合成成本': browserLab(
    '渲染成本可视化',
    '区分样式计算、布局、绘制和合成，避免把高风险动画与全页重排包装成性能优化。',
    browserTask(
      'html-css-final-render-cost-practice',
      '活动列表的变换动画',
      '用 transform 和 opacity 展示进入状态，同时提供 reduced-motion 替代，不用 width 或 top 动画。',
      htmlPage({
        key: 'render-cost-practice',
        title: '活动动态列表',
        style: `
      :root { --ink: #20252b; --paper: #f2f5f7; --panel: #fff; --blue: #236582; --line: #aeb8be; --accent: #d17a25; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(58rem, 100%); margin-inline: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { color: var(--blue); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .feed { display: grid; gap: 0.7rem; }
      .item { padding: 1rem; background: var(--panel); border: 1px solid var(--line); transform: translateY(0); opacity: 1; transition: transform 180ms ease, opacity 180ms ease; }
      .item.is-entering { transform: translateY(0.45rem); opacity: 0.72; }
      .item:hover { transform: translateY(-0.12rem); }
      .meta { display: flex; flex-wrap: wrap; gap: 0.4rem 0.8rem; color: #59666d; }
      .avatar { display: inline-grid; inline-size: 2rem; place-items: center; color: white; background: var(--blue); }
      .item h2 { margin: 0; font-size: 1.05rem; }
      .note { margin-block-start: 1rem; padding: 0.8rem; background: #e7eff2; border-inline-start: 0.3rem solid var(--accent); }
      @media (prefers-reduced-motion: reduce) { .item { transition: none; } .item.is-entering { transform: none; opacity: 1; box-shadow: inset 0.3rem 0 var(--accent); } .item:hover { transform: none; } }
    `,
        body: `    <main>
      <p>项目活动</p>
      <h1>最近更新</h1>
      <section class="feed" aria-label="项目动态">
        <article class="item is-entering"><div class="meta"><span class="avatar" aria-hidden="true">周</span><time datetime="2026-11-24T20:15:00+08:00">20:15</time></div><h2>周宁更新了数据库迁移检查清单</h2><p>补充回滚脚本校验和与停止条件。</p></article>
        <article class="item"><div class="meta"><span class="avatar" aria-hidden="true">林</span><time datetime="2026-11-24T20:08:00+08:00">20:08</time></div><h2>林澈完成订单服务灰度</h2><p>错误率 0.12%，延迟保持稳定。</p></article>
        <article class="item"><div class="meta"><span class="avatar" aria-hidden="true">谢</span><time datetime="2026-11-24T19:56:00+08:00">19:56</time></div><h2>谢雨上传了巡检照片</h2><p>2 号泵组轴承温度连续三次正常。</p></article>
      </section>
      <p class="note">状态变化只使用 transform 与 opacity；减少动态偏好下取消位移，改用静态左边条表达进入状态。</p>
    </main>`,
      }),
      '默认状态下活动卡仅有 transform 与 opacity 过渡；减少动态偏好时过渡为 none 且进入卡显示静态左边条；没有 width、top 或 margin 动画；三档视口均无横向滚动。',
    ),
    browserTask(
      'html-css-final-render-cost-apply',
      '数据面板的分层更新',
      '把静态壳层与变化数字分成不同区域，使用 containment 与局部重绘边界，避免整页布局抖动。',
      htmlPage({
        key: 'render-cost-apply',
        title: '实时运营指标',
        style: `
      :root { --ink: #20251f; --paper: #eff1e9; --panel: #fffef8; --green: #1d6448; --amber: #a46911; --line: #aab2a2; --blue: #265e74; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.55 system-ui, sans-serif; }
      main { width: min(70rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      .shell { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(15rem, 1fr); gap: 0.8rem; }
      .panel { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .panel h1 { margin: 0; color: var(--green); font-size: clamp(1.8rem, 6vw, 3.5rem); line-height: 1.05; }
      .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; margin-block-start: 1rem; }
      .metric { contain: layout paint style; min-inline-size: 0; padding: 0.9rem; background: #f5f7ef; border: 1px solid #b4bcae; }
      .metric strong { display: block; color: var(--blue); font-size: clamp(1.6rem, 5vw, 2.5rem); line-height: 1; font-variant-numeric: tabular-nums; }
      .activity { align-self: start; }
      .activity li { padding-block: 0.6rem; border-bottom: 1px solid #d8ddd3; }
      .activity ul { padding-inline-start: 1.2rem; }
      .budget { margin-block-start: 0.8rem; padding: 0.8rem; background: #f7eedc; border-inline-start: 0.3rem solid var(--amber); }
      .budget code { overflow-wrap: anywhere; }
      @media (max-width: 48rem) { .shell { grid-template-columns: 1fr; } .activity { order: -1; } }
      @media (max-width: 30rem) { .metrics { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <div class="shell">
        <section class="panel">
          <p>区域运营 · 实时</p><h1>订单与履约</h1>
          <div class="metrics">
            <article class="metric"><span>当前订单</span><strong>1,284</strong><span>较 5 分钟前 +18</span></article>
            <article class="metric"><span>待拣货</span><strong>342</strong><span>目标低于 380</span></article>
            <article class="metric"><span>平均耗时</span><strong>18m</strong><span>目标低于 20m</span></article>
          </div>
          <p class="budget"><code>contain: layout paint style</code> 让单个指标区域的样式、布局与绘制影响留在自身内部。</p>
        </section>
        <aside class="panel activity"><h2>最近事件</h2><ul><li>20:38 华东仓恢复标准波次。</li><li>20:32 订单入口延迟降至 120ms。</li><li>20:25 北岸仓补货批次完成。</li></ul></aside>
      </div>
    </main>`,
      }),
      '每张指标卡有 containment；1280px 指标与事件并排，390px 事件先显示且指标两列或单列；320px 指标单列；数字保持单行，页面三档均无横向滚动。',
    ),
  ),

  'programming:CSS3 · 性能、工具链与企业设计系统：Stylelint、格式化和设计 Token 构建': browserLab(
    '质量门禁与 Token 来源',
    '让统一样式规则、Token 清单和构建产物身份在同一套可检查结构中呈现。',
    browserTask(
      'html-css-final-tooling-practice',
      '设计 Token 检查表',
      '展示颜色、间距和圆角 Token，并给出 Stylelint 规则、源文件与生成变量之间的对照。',
      htmlPage({
        key: 'tooling-practice',
        title: '设计 Token 检查表',
        style: `
      :root {
        --ink: #202820;
        --paper: #f1f3ec;
        --panel: #fffef9;
        --green: #1c6549;
        --orange: #a55b1d;
        --line: #acb5a9;
        --space-2: 0.5rem;
        --space-3: 0.75rem;
        --space-4: 1.25rem;
        --radius-1: 0.25rem;
        --radius-2: 0.5rem;
      }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 ui-monospace, "Cascadia Code", monospace; }
      main { width: min(68rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--green); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; font-family: system-ui, sans-serif; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
      .token { min-inline-size: 0; padding: var(--space-4); background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-2); }
      .swatch { block-size: 4rem; margin-block-end: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-1); background: var(--green); }
      .token:nth-child(2) .swatch { background: var(--orange); }
      .token:nth-child(3) .swatch { background: #315f80; }
      code { overflow-wrap: anywhere; }
      .rules { margin-block-start: 1rem; padding: var(--space-3); background: #e8ede6; border-inline-start: 0.3rem solid var(--orange); border-radius: var(--radius-1); }
      ul { padding-inline-start: 1.2rem; }
      @media (max-width: 44rem) { .grid { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>设计系统 · tokens.json → tokens.css</p>
      <h1>Token 与质量门禁</h1>
      <section class="grid">
        <article class="token"><div class="swatch"></div><h2>color.action</h2><code>#1c6549</code></article>
        <article class="token"><div class="swatch"></div><h2>color.warning</h2><code>#a55b1d</code></article>
        <article class="token"><div class="swatch"></div><h2>color.info</h2><code>#315f80</code></article>
      </section>
      <section class="rules">
        <h2>阻塞规则</h2>
        <ul><li><code>color-no-invalid-hex: true</code></li><li><code>declaration-block-no-duplicate-properties: true</code></li><li><code>no-duplicate-selectors: true</code></li><li>生成文件由源 Token 构建，禁止手工覆盖。</li></ul>
      </section>
    </main>`,
      }),
      '三张 Token 卡使用同一间距和圆角尺度；颜色值完整可读；规则区域列出至少三条阻塞规则；390px 与 320px 卡片单列且代码不撑破页面。',
    ),
    browserTask(
      'html-css-final-tooling-apply',
      '样式产物发布清单',
      '展示 buildId、Token 哈希、Stylelint 结果与回滚产物；用状态标签区分阻塞项和通过项。',
      htmlPage({
        key: 'tooling-apply',
        title: 'CSS 产物发布清单',
        style: `
      :root { --ink: #1f262e; --paper: #edf1f4; --panel: #fff; --navy: #253b55; --blue: #286786; --green: #22644a; --red: #933a37; --amber: #95610f; --line: #a9b3bc; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.55 system-ui, sans-serif; }
      main { width: min(66rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      header { padding: 1rem; color: white; background: var(--navy); }
      h1 { margin: 0; font-size: clamp(1.8rem, 6vw, 3.5rem); line-height: 1.05; }
      .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; margin-block: 0.8rem; }
      .summary div { min-inline-size: 0; padding: 0.8rem; background: var(--panel); border: 1px solid var(--line); }
      .summary strong { display: block; color: var(--blue); overflow-wrap: anywhere; }
      .checks { border: 1px solid var(--line); background: var(--panel); }
      .check { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 0.7rem; align-items: center; padding: 0.8rem 1rem; border-top: 1px solid var(--line); }
      .check:first-child { border-top: 0; }
      .check > * { min-inline-size: 0; }
      .status { padding: 0.2rem 0.5rem; border: 1px solid currentColor; color: var(--green); font-weight: 800; }
      .status.blocked { color: var(--red); border-style: dashed; }
      .status.warn { color: var(--amber); }
      code { overflow-wrap: anywhere; }
      .rollback { margin-block-start: 0.8rem; padding: 0.8rem; background: #f9edda; border-inline-start: 0.3rem solid var(--amber); }
      @media (max-width: 38rem) { .summary { grid-template-columns: 1fr; } .check { grid-template-columns: minmax(0, 1fr) auto; } .check code { grid-column: 1 / -1; } }
      @media (max-width: 26rem) { .check { grid-template-columns: 1fr; } .status { justify-self: start; } }
    `,
        body: `    <main>
      <header><p>前端平台 · release</p><h1>CSS 产物发布清单</h1></header>
      <section class="summary"><div><span>Build</span><strong>2026.11.24.7</strong></div><div><span>Token 哈希</span><strong>4d91c2a8</strong></div><div><span>首屏 CSS</span><strong>65.8 KB</strong></div></section>
      <section class="checks" aria-label="发布检查">
        <div class="check"><strong>Stylelint</strong><code>0 errors, 0 warnings</code><span class="status">通过</span></div>
        <div class="check"><strong>重复选择器</strong><code>no-duplicate-selectors=true</code><span class="status">通过</span></div>
        <div class="check"><strong>Token 源与产物</strong><code>tokens.json → tokens.css</code><span class="status blocked">阻塞</span></div>
        <div class="check"><strong>浏览器矩阵</strong><code>Chromium / Firefox / WebKit</code><span class="status warn">待跑</span></div>
      </section>
      <p class="rollback">回滚目标：<code>previous-manifest.4d22f1.json</code>；回滚后需重跑三个关键页面冒烟。</p>
    </main>`,
      }),
      '阻塞、待跑、通过三类状态有文字和边框差异；1280px 检查项一行展示，320px 改单列；长 buildId 与回滚文件名可换行；页面无横向滚动。',
    ),
  ),

  'programming:CSS3 · 性能、工具链与企业设计系统：视觉回归、截图矩阵与审查流程': browserLab(
    '多尺寸截图矩阵',
    '用页面、视口和状态构成可解释的回归矩阵，并同时记录像素与关键几何。',
    browserTask(
      'html-css-final-visual-matrix-practice',
      '价格页三档截图',
      '为价格页设置 1280、390、320 三档布局；窄屏突出推荐方案，但不隐藏功能和价格。',
      htmlPage({
        key: 'visual-matrix-practice',
        title: '价格方案回归页',
        style: `
      :root { --ink: #24201d; --paper: #f5efe4; --panel: #fffdf8; --brown: #5e4331; --orange: #ac561d; --green: #1f6650; --line: #b9aa9a; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 Georgia, "Noto Serif SC", serif; }
      main { width: min(70rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      header { max-inline-size: 46rem; }
      h1 { margin-block-end: 0.5rem; color: var(--brown); font-size: clamp(2.1rem, 8vw, 5rem); line-height: 1; }
      .plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
      .plan { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .plan.featured { border: 2px solid var(--orange); box-shadow: 0 0.8rem 2rem #78502c24; }
      .tag { display: inline-block; padding: 0.2rem 0.45rem; color: white; background: var(--orange); font: 0.78rem/1.4 system-ui, sans-serif; font-weight: 800; }
      .price { display: block; margin-block: 0.5rem; color: var(--green); font-size: clamp(1.8rem, 6vw, 2.8rem); line-height: 1; }
      ul { padding-inline-start: 1.1rem; }
      button { min-height: 2.9rem; inline-size: 100%; border: 2px solid var(--brown); color: white; background: var(--brown); font: inherit; font-weight: 800; }
      .featured button { border-color: var(--orange); background: var(--orange); }
      .matrix { margin-block-start: 1rem; padding: 0.8rem; background: #e9ece4; border-inline-start: 0.3rem solid var(--green); font: 0.8rem/1.5 ui-monospace, monospace; overflow-wrap: anywhere; }
      @media (max-width: 46rem) { .plans { grid-template-columns: 1fr; } .featured { order: -1; } }
    `,
        body: `    <main>
      <header><p>方案与价格</p><h1>让团队为实际使用的功能付费</h1><p>所有方案都包含基础权限和加密传输。</p></header>
      <section class="plans" aria-label="价格方案">
        <article class="plan"><h2>起步版</h2><span class="price">¥0</span><p>3 名成员 · 5 个项目</p><ul><li>基础权限</li><li>5GB 存储</li></ul><button type="button">免费开始</button></article>
        <article class="plan featured"><span class="tag">推荐</span><h2>团队版</h2><span class="price">¥39</span><p>每成员每月 · 不限项目</p><ul><li>审批流程</li><li>100GB 存储</li><li>优先支持</li></ul><button type="button">开始试用</button></article>
        <article class="plan"><h2>企业版</h2><span class="price">按需</span><p>治理、审计与专属服务</p><ul><li>单点登录</li><li>服务等级协议</li></ul><button type="button">联系顾问</button></article>
      </section>
      <p class="matrix">matrix: 1280x900 default; 390x844 stacked; 320x720 stacked; overflowBudget=0px</p>
    </main>`,
      }),
      '1280px 三卡同排，390px 与 320px 推荐卡第一、其余单列；320px 下价格、按钮和矩阵文本均可见；三档 document scrollWidth 等于 clientWidth；推荐卡焦点/边界清楚。',
    ),
    browserTask(
      'html-css-final-visual-matrix-apply',
      '导航焦点与状态矩阵',
      '制作工具导航，展示默认、选中、键盘焦点和通知状态；窄屏导航变为两列并可完整读取。',
      htmlPage({
        key: 'visual-matrix-apply',
        title: '分析与工具导航',
        style: `
      :root { --ink: #1c2730; --paper: #edf2f5; --panel: #fff; --blue: #245d7a; --focus: #dd8b21; --green: #21664a; --line: #aab5bc; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(60rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--blue); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      nav { padding: 0.8rem; background: var(--panel); border: 1px solid var(--line); }
      nav ul { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; padding: 0; list-style: none; }
      nav a { position: relative; display: flex; min-block-size: 3.1rem; align-items: center; justify-content: center; padding: 0.5rem; color: var(--ink); border: 1px solid #82929b; text-align: center; text-decoration: none; }
      nav a[aria-current="page"] { color: white; background: var(--blue); border-color: var(--blue); }
      nav a[data-focus="true"] { outline: 0.25rem solid var(--focus); outline-offset: 0.15rem; }
      nav a .count { position: absolute; inset-block-start: 0.25rem; inset-inline-end: 0.25rem; min-inline-size: 1.35rem; padding-inline: 0.25rem; color: white; background: #973b36; border-radius: 999px; text-align: center; font-size: 0.75rem; }
      .evidence { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; margin-block-start: 0.8rem; }
      .evidence div { padding: 0.75rem; background: white; border: 1px solid var(--line); }
      .evidence strong { display: block; color: var(--green); }
      code { overflow-wrap: anywhere; }
      @media (max-width: 42rem) { nav ul { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 26rem) { .evidence { grid-template-columns: 1fr; } nav a { padding-inline: 0.35rem; } }
    `,
        body: `    <main>
      <p>运营分析 · 工具入口</p>
      <h1>把焦点也纳入截图</h1>
      <nav aria-label="分析工具">
        <ul>
          <li><a href="#overview" aria-current="page">概览</a></li>
          <li><a href="#orders">订单</a></li>
          <li><a href="#quality" data-focus="true">质量</a></li>
          <li><a href="#alerts">告警<span class="count">3</span></a></li>
        </ul>
      </nav>
      <section class="evidence"><div id="orders"><strong>订单</strong><code>今日 8,214 单</code></div><div id="quality"><strong>质量</strong><code>98.6% 准点</code></div><div id="alerts"><strong>告警</strong><code>3 项待处理</code></div></section>
      <p id="overview">当前页面：运营概览。切换视图不会丢失今日筛选。</p>
    </main>`,
      }),
      '选中项有蓝底白字；质量入口显示静态焦点环且没有推动布局；告警计数不遮住文字；390px 与 320px 导航两列；三档页面无横向溢出，证据卡单列或三列均可读。',
    ),
  ),

  'programming:CSS3 · 性能、工具链与企业设计系统：组件库版本、兼容和迁移': browserLab(
    '版本兼容与迁移',
    '用版本清单、弃用别名和渐进增强保证组件升级可观察、可回滚。',
    browserTask(
      'html-css-final-version-practice',
      '按钮旧类迁移',
      '保留旧 class 的兼容层，同时展示 data-size 和 data-tone 新接口；两者视觉一致。',
      htmlPage({
        key: 'version-practice',
        title: '按钮接口迁移',
        style: `
      @layer reset, components, compatibility, app;
      @layer reset { button { font: inherit; } }
      @layer components {
        .button { min-height: 2.9rem; padding: 0.6rem 1rem; border: 2px solid #1f5f78; color: white; background: #1f5f78; font-weight: 850; }
        .button[data-tone="quiet"] { color: #1f5f78; background: white; }
      }
      @layer compatibility {
        .button--quiet { color: #1f5f78; background: white; border-color: #1f5f78; }
      }
      @layer app {
        body { margin: 0; color: #202b31; background: #eef2f3; font: 1rem/1.6 system-ui, sans-serif; }
        main { width: min(60rem, 100%); margin-inline: auto; padding: clamp(1rem, 4vw, 3rem); }
        h1 { color: #1f5f78; font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
        .compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
        .surface { padding: 1rem; background: white; border: 1px solid #a9b6bc; }
        .deprecated { color: #7d3b1d; background: #fff3df; border-inline-start: 0.3rem solid #a76121; }
        code { overflow-wrap: anywhere; }
        @media (max-width: 34rem) { .compare { grid-template-columns: 1fr; } button { inline-size: 100%; } }
      }
    `,
        body: `    <main>
      <p>组件库 v4 → v5</p>
      <h1>按钮兼容迁移</h1>
      <section class="compare">
        <div class="surface"><h2>旧接口</h2><button class="button button--quiet" type="button">稍后处理</button><p><code>&lt;button class="button button--quiet"&gt;</code></p></div>
        <div class="surface"><h2>新接口</h2><button class="button" data-tone="quiet" type="button">稍后处理</button><p><code>&lt;button class="button" data-tone="quiet"&gt;</code></p></div>
      </section>
      <p class="deprecated">旧类仅在 compatibility 层保留；v5 发布前必须统计使用量并给出删除日期。</p>
    </main>`,
      }),
      '旧类与新 data-tone 按钮视觉一致；compatibility 层不压过组件基础层；390px 与 320px 两列改单列、按钮满宽；代码文本可换行，页面无横向滚动。',
    ),
    browserTask(
      'html-css-final-version-apply',
      '渐进增强的主题迁移',
      '用基础主题、@supports 增强和 data-theme 显式覆盖，展示不支持高级颜色时的可读回退。',
      htmlPage({
        key: 'version-apply',
        title: '主题迁移预览',
        style: `
      :root { color-scheme: light; --ink: #24231f; --paper: #f5f0e6; --panel: #fffdf8; --accent: #8d4422; --line: #b2a493; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 Georgia, "Noto Serif SC", serif; }
      [data-theme="midnight"] { --ink: #edf2ef; --paper: #15211d; --panel: #22322c; --accent: #e3a85c; --line: #6f8278; }
      main { width: min(62rem, 100%); margin-inline: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { color: var(--accent); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .themes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
      .theme { min-inline-size: 0; padding: 1rem; color: var(--ink); background: var(--panel); border: 1px solid var(--line); }
      .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-block-start: 1rem; }
      button { min-height: 2.8rem; padding-inline: 0.85rem; color: white; background: var(--accent); border: 2px solid var(--accent); font: inherit; font-weight: 800; }
      .quiet { color: var(--ink); background: var(--panel); border-color: var(--line); }
      @supports (color: color-mix(in srgb, black, white)) { .theme { border-color: color-mix(in srgb, var(--line), var(--panel) 22%); } .quiet:hover { background: color-mix(in srgb, var(--panel), var(--accent) 12%); } }
      .fallback { margin-block-start: 0.8rem; padding: 0.8rem; background: #e7ece8; color: #26332d; border-inline-start: 0.3rem solid #8d4422; }
      code { overflow-wrap: anywhere; }
      @media (max-width: 34rem) { .themes { grid-template-columns: 1fr; } button { inline-size: 100%; } }
    `,
        body: `    <main>
      <p>设计系统 · 主题迁移 2026.11</p>
      <h1>先保证可读，再增强颜色</h1>
      <section class="themes">
        <article class="theme"><p>浅色主题</p><h2>日程与审批</h2><p>基础令牌直接提供文本、表面和操作色。</p><div class="actions"><button type="button">确认安排</button><button class="quiet" type="button">稍后</button></div></article>
        <article class="theme" data-theme="midnight"><p>午夜主题</p><h2>夜间值班视图</h2><p>显式 data-theme 覆盖系统偏好，保持相同信息层级。</p><div class="actions"><button type="button">确认安排</button><button class="quiet" type="button">稍后</button></div></article>
      </section>
      <p class="fallback"><code>@supports (color: color-mix(...))</code> 只增强边界与悬停颜色；不支持时基础背景、文字和按钮仍可读。</p>
    </main>`,
      }),
      '浅色与午夜主题都有清晰文字、表面和按钮边界；@supports 增强不承担基础可读性；390px 与 320px 主题单列、按钮满宽；三档页面无横向滚动。',
    ),
  ),

  'programming:CSS3 · 性能、工具链与企业设计系统：企业后台设计系统毕业项目': browserLab(
    '设计系统毕业台',
    '组合 Token、布局、状态、响应式和可验证几何，交付一个可重放的企业后台样式基线。',
    browserTask(
      'html-css-final-graduation-practice',
      '组件陈列与发布门禁',
      '建立按钮、状态、表格和提示的陈列页；显示 Token、视口矩阵与阻塞门禁。',
      htmlPage({
        key: 'graduation-practice',
        title: '企业设计系统陈列',
        style: `
      @layer reset, tokens, components, utilities;
      @layer reset { *, *::before, *::after { box-sizing: border-box; } body { margin: 0; } }
      @layer tokens {
        :root {
          --ink: #1e2823;
          --paper: #edf1ec;
          --panel: #fffef9;
          --green: #1f664b;
          --amber: #9b6213;
          --red: #913b37;
          --line: #a9b3a8;
          --s2: 0.5rem;
          --s3: 0.75rem;
          --s4: 1.25rem;
          --r1: 0.25rem;
          --r2: 0.5rem;
        }
      }
      @layer components {
        .button { min-height: 2.85rem; padding-inline: 0.9rem; color: white; background: var(--green); border: 2px solid var(--green); border-radius: var(--r1); font: inherit; font-weight: 800; }
        .button[data-tone="quiet"] { color: var(--green); background: var(--panel); }
        .badge { display: inline-flex; min-height: 2rem; align-items: center; padding-inline: 0.5rem; border: 1px solid currentColor; border-radius: 999px; color: var(--green); font-size: 0.82rem; font-weight: 850; }
        .badge[data-state="warning"] { color: var(--amber); background: #fff6df; }
        .badge[data-state="error"] { color: var(--red); background: #fff0ee; border-style: dashed; }
        .table-shell { max-inline-size: 100%; overflow-x: auto; border: 1px solid var(--line); background: var(--panel); }
        table { width: 100%; min-width: 38rem; border-collapse: collapse; }
        th, td { padding: var(--s3); border-bottom: 1px solid var(--line); text-align: left; }
      }
      @layer utilities { .visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(74rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s3); padding: var(--s4); color: white; background: #203b31; border-radius: var(--r2); }
      header h1 { margin: 0; font-size: clamp(1.8rem, 6vw, 3.6rem); line-height: 1.04; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; margin-block-start: 0.8rem; }
      .panel { min-inline-size: 0; padding: var(--s4); background: var(--panel); border: 1px solid var(--line); border-radius: var(--r2); }
      .row { display: flex; flex-wrap: wrap; gap: var(--s2); align-items: center; }
      .notice { padding: var(--s3); color: #603a07; background: #fff4dc; border-inline-start: 0.3rem solid var(--amber); border-radius: var(--r1); }
      .matrix { padding: var(--s3); background: #e4ebe6; border-inline-start: 0.3rem solid var(--green); font: 0.8rem/1.55 ui-monospace, monospace; overflow-wrap: anywhere; }
      @media (max-width: 46rem) { .grid { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <header><div><p>Northstar Design System · v5</p><h1>企业后台组件基线</h1></div><span class="badge">reviewed</span></header>
      <div class="grid">
        <section class="panel"><h2>按钮与状态</h2><div class="row"><button class="button" type="button">保存</button><button class="button" data-tone="quiet" type="button">取消</button><span class="badge">通过</span><span class="badge" data-state="warning">待复核</span><span class="badge" data-state="error">阻塞</span></div><p class="notice">状态同时使用文字、形状和边框；按钮至少 44px。</p></section>
        <section class="panel"><h2>发布门禁</h2><ul><li>Stylelint 0 warnings</li><li>关键页面 a11y 通过</li><li>1280 / 390 / 320 截图通过</li><li>首屏 CSS 不超过 70KB</li></ul></section>
        <section class="panel" style="grid-column:1/-1"><h2>数据表局部滚动</h2><div class="table-shell" tabindex="0"><table><caption class="visually-hidden">组件发布记录</caption><thead><tr><th>组件</th><th>版本</th><th>状态</th><th>回滚产物</th></tr></thead><tbody><tr><td>button</td><td>v5</td><td>通过</td><td>button.4d91c2.css</td></tr><tr><td>dialog</td><td>v4</td><td>待复核</td><td>dialog.7a21e9.css</td></tr></tbody></table></div></section>
        <section class="panel" style="grid-column:1/-1"><h2>验收记录</h2><p class="matrix">viewports=1280x900,390x844,320x720; documentOverflow=0; focusVisible=true; reducedMotion=covered; rollback=manifest.previous</p></section>
      </div>
    </main>`,
      }),
      '1280px 组件与门禁并排，390px 与 320px 面板单列；表格只在自身滚动且可聚焦；按钮和状态徽标可区分；页面三档 scrollWidth 等于 clientWidth；发布门禁与视口记录完整可见。',
    ),
    browserTask(
      'html-css-final-graduation-apply',
      '后台首页最终验收',
      '交付导航、指标、任务表、风险提示和回滚说明；用容器查询与断点让内容在窄屏和嵌套列中都稳定。',
      htmlPage({
        key: 'graduation-apply',
        title: '北岸运营后台',
        style: `
      @layer reset, tokens, layout, components, utilities;
      @layer reset { *,*::before,*::after { box-sizing: border-box; } body { margin: 0; } }
      @layer tokens {
        :root { --ink:#1e272c; --paper:#eef2f2; --panel:#fff; --nav:#1d3541; --blue:#24647d; --green:#246547; --amber:#95600f; --red:#913b38; --line:#a7b2b7; --s1:.3rem; --s2:.6rem; --s3:1rem; --s4:1.5rem; }
      }
      @layer layout {
        .app { display:grid; grid-template-columns:14rem minmax(0,1fr); grid-template-rows:auto 1fr; grid-template-areas:"nav head" "nav main"; min-block-size:100vh; }
        .nav { grid-area:nav; } .head { grid-area:head; } .main { grid-area:main; }
      }
      @layer components {
        .surface { min-inline-size:0; padding:var(--s3); background:var(--panel); border:1px solid var(--line); container-type:inline-size; }
        .metric strong { display:block; color:var(--blue); font-size:clamp(1.7rem,8cqi,2.5rem); line-height:1; font-variant-numeric:tabular-nums; }
        .status { padding:var(--s1) var(--s2); border:1px solid currentColor; color:var(--green); font-weight:800; }
        .status.warn { color:var(--amber); background:#fff6df; }
      }
      @layer utilities { .sr-only { position:absolute; inline-size:1px; block-size:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; } }
      body { color:var(--ink); background:var(--paper); font:1rem/1.6 system-ui,sans-serif; }
      .nav { padding:var(--s3); color:white; background:var(--nav); }
      .nav h1 { font-size:1.25rem; }
      .nav ul { display:grid; gap:var(--s1); padding:0; list-style:none; }
      .nav a { display:flex; min-block-size:2.75rem; align-items:center; padding-inline:var(--s2); text-decoration:none; border-inline-start:.25rem solid transparent; }
      .nav a[aria-current="page"] { background:#2b5261; border-inline-start-color:#f1b95d; }
      .head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:var(--s2); padding:var(--s3); background:white; border-bottom:1px solid var(--line); }
      .head button,.head input { min-height:2.75rem; padding-inline:var(--s2); border:1px solid #839198; font:inherit; }
      .main { display:grid; gap:.75rem; min-inline-size:0; padding:clamp(.7rem,3vw,1.5rem); }
      .metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.7rem; }
      .content { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(15rem,1fr); gap:.7rem; }
      .task-table { max-inline-size:100%; overflow-x:auto; }
      table { width:100%; min-width:35rem; border-collapse:collapse; }
      th,td { padding:.7rem; border-bottom:1px solid var(--line); text-align:left; }
      .risk { padding:var(--s2); color:#673d08; background:#fff4dc; border-inline-start:.3rem solid var(--amber); }
      .rollback { margin-block-start:.7rem; font-family:ui-monospace,monospace; overflow-wrap:anywhere; }
      @container (max-width: 18rem) { .metric strong { font-size:1.8rem; } }
      @media (max-width:50rem) {
        .app { grid-template-columns:1fr; grid-template-rows:auto auto 1fr; grid-template-areas:"head" "nav" "main"; }
        .nav ul { grid-template-columns:repeat(4,minmax(0,1fr)); }
        .nav a { justify-content:center; text-align:center; }
        .content { grid-template-columns:1fr; }
      }
      @media (max-width:32rem) {
        .metrics { grid-template-columns:1fr; }
        .nav ul { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .head form { display:grid; inline-size:100%; }
        .head input,.head button { inline-size:100%; }
      }
    `,
        body: `    <div class="app">
      <nav class="nav" aria-label="运营后台导航"><h1>北岸运营</h1><ul><li><a href="#overview" aria-current="page">概览</a></li><li><a href="#tasks">任务</a></li><li><a href="#quality">质量</a></li><li><a href="#settings">设置</a></li></ul></nav>
      <header class="head"><div><p>华东区域 · 11 月 24 日</p><h2>运营概览</h2></div><form action="#tasks"><label class="sr-only" for="search">搜索任务</label><input id="search" type="search" placeholder="任务或门店"><button type="submit">搜索</button></form></header>
      <main class="main" id="overview">
        <section class="metrics" aria-label="核心指标"><article class="surface metric"><span>有效订单</span><strong>8,214</strong><span>较昨日 +4.8%</span></article><article class="surface metric"><span>准点履约</span><strong>98.6%</strong><span>目标 98%</span></article><article class="surface metric"><span>待处理异常</span><strong>3</strong><span>均在 SLA 内</span></article></section>
        <div class="content">
          <section class="surface" id="tasks"><h2>门店任务</h2><div class="task-table" tabindex="0"><table><caption class="sr-only">门店待处理任务</caption><thead><tr><th>门店</th><th>任务</th><th>负责人</th><th>状态</th></tr></thead><tbody><tr><td>东港店</td><td>补货确认</td><td>周宁</td><td>进行中</td></tr><tr><td>临港店</td><td>温控复核</td><td>林澈</td><td><span class="status warn">待复核</span></td></tr><tr><td>北岸店</td><td>交接班检查</td><td>谢雨</td><td>已完成</td></tr></tbody></table></div></section>
          <aside class="surface" id="quality"><h2>风险与回滚</h2><p class="risk">临港店温控连续两次延迟上报，未达到自动停业阈值。</p><p class="rollback">rollback-manifest=2026.11.24.7; owner=ops-platform; smoke=/overview,/tasks,/quality</p><p id="settings">主题、通知和权限设置由平台管理员维护；发布回滚后需重新检查指标、任务表与移动底栏。</p></aside>
        </div>
      </main>
    </div>`,
      }),
      '1280px 后台显示侧栏、顶栏、三指标和双栏内容；390px 导航四列、内容单列；320px 指标单列、导航两列、搜索表单满宽；表格仅自身滚动，页面三档无横向溢出。',
    ),
  ),

  'programming:HTML5 · 浏览器、文档与开发工具：相对路径、绝对路径与站点目录': browserLab(
    '路径解析与站点目录',
    '从文档 URL 出发解释相对路径、站点根路径和目录入口，并用页面结构呈现最终请求关系。',
    browserTask(
      'html-css-final-paths-practice',
      '资源路径检查板',
      '为产品页列出 HTML、样式、图片和下载文件的路径，标注各自以什么 URL 为基准。',
      htmlPage({
        key: 'paths-practice',
        title: '产品页资源路径',
        style: `
      :root { --ink: #202b30; --paper: #f1f5f4; --panel: #fff; --teal: #176860; --amber: #9b6110; --line: #aab8b4; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(66rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      header { padding: 1rem; color: white; background: var(--teal); }
      h1 { margin: 0; font-size: clamp(1.9rem, 7vw, 4rem); line-height: 1.05; }
      .tree { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; margin-block: 0.8rem; }
      .folder, .rules { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .folder h2 { color: var(--teal); }
      ul { padding-inline-start: 1.15rem; }
      code { overflow-wrap: anywhere; }
      .rules { border-inline-start: 0.3rem solid var(--amber); }
      dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 0.35rem 0.7rem; }
      dt { font-weight: 800; } dd { margin: 0; min-inline-size: 0; overflow-wrap: anywhere; }
      @media (max-width: 42rem) { .tree { grid-template-columns: 1fr; } }
      @media (max-width: 27rem) { dl { grid-template-columns: 1fr; } dd { margin-block-end: 0.4rem; } }
    `,
        body: `    <main>
      <header><p>站点根：/products/desk-organizer/</p><h1>产品页资源路径</h1></header>
      <section class="tree">
        <article class="folder"><h2>/products/desk-organizer/</h2><ul><li><code>index.html</code></li><li><code>spec.html</code></li></ul></article>
        <article class="folder"><h2>/assets/images/</h2><ul><li><code>desk-640.webp</code></li><li><code>desk-1280.webp</code></li></ul></article>
        <article class="folder"><h2>/downloads/</h2><ul><li><code>assembly-guide.pdf</code></li></ul></article>
      </section>
      <section class="rules">
        <h2>从 index.html 解析</h2>
        <dl>
          <dt>同目录说明页</dt><dd><code>href="spec.html"</code></dd>
          <dt>跨一级图片</dt><dd><code>src="../../assets/images/desk-640.webp"</code></dd>
          <dt>站点根下载</dt><dd><code>href="/downloads/assembly-guide.pdf"</code></dd>
          <dt>目录入口</dt><dd><code>/products/desk-organizer/</code></dd>
        </dl>
        <p>路径最终都由当前文档 URL 解析；页面移动到子目录后，相对路径的基准也会变化。</p>
      </section>
    </main>`,
      }),
      '页面用站点根、产品目录和资源目录三级结构表达路径基准；四个示例分别使用同目录、上两级和站点根；320px 路径代码可换行且页面无横向滚动。',
    ),
    browserTask(
      'html-css-final-paths-apply',
      '多层级面包屑与目录',
      '建立首页、产品、配置三个层级的导航和面包屑；用文本标出最终文档 URL 与相对链接关系。',
      htmlPage({
        key: 'paths-apply',
        title: '桌面收纳架配置页',
        style: `
      :root { --ink: #2b2924; --paper: #f4efe5; --panel: #fffdf8; --brown: #5d4331; --orange: #a55a21; --line: #b6a998; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 Georgia, "Noto Serif SC", serif; }
      .top { padding: 1rem; color: white; background: var(--brown); }
      .crumbs { padding: 0.75rem clamp(1rem, 5vw, 4rem); background: #e9dfd0; }
      .crumbs ol { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0; padding: 0; list-style: none; }
      .crumbs li + li::before { content: "/"; padding-inline-end: 0.3rem; color: #7f6d5c; }
      main { width: min(58rem, 100%); margin-inline: auto; padding: clamp(1rem, 4vw, 3rem); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .config { display: grid; grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.7fr); gap: 1rem; }
      .panel { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.4rem 0.7rem; }
      dt { font-weight: 800; } dd { margin: 0; overflow-wrap: anywhere; }
      code { overflow-wrap: anywhere; }
      .summary { border-inline-start: 0.3rem solid var(--orange); }
      @media (max-width: 42rem) { .config { grid-template-columns: 1fr; } }
      @media (max-width: 26rem) { dl { grid-template-columns: 1fr; } .crumbs { padding-inline: 0.7rem; } }
    `,
        body: `    <header class="top" id="home"><strong>木作生活馆</strong></header>
    <nav class="crumbs" aria-label="面包屑"><ol><li><a href="#home">首页</a></li><li><a href="#products">产品</a></li><li aria-current="page">配置</li></ol></nav>
    <main id="products">
      <p>文档 URL：/products/desk-organizer/configure.html</p>
      <h1>桌面收纳架配置</h1>
      <div class="config">
        <section class="panel"><h2>选择部件</h2><p><label><input type="checkbox" checked> 双层侧板</label></p><p><label><input type="checkbox"> 抽屉模块</label></p><p><a href="#guide">查看装配说明路径</a></p></section>
        <aside class="panel summary"><h2>路径检查</h2><dl><dt>图片</dt><dd><code>../../assets/images/rack.webp</code></dd><dt>说明书</dt><dd><code>../../downloads/rack-guide.pdf</code></dd><dt>同级页面</dt><dd><code>materials.html</code></dd></dl></aside>
      </div>
      <p id="guide">说明书实际文件位于站点的 /downloads/rack-guide.pdf。</p>
    </main>`,
      }),
      '面包屑包含首页、产品、配置三级且当前页有 aria-current；配置页显示相对基准；320px 面包屑和定义列表可换行；所有文本和复选框位于容器内，页面无横向溢出。',
    ),
  ),

  'programming:HTML5 · 语义、结构与企业页面骨架：企业站点的页面信息架构': browserLab(
    '企业站点信息架构',
    '把服务、案例、联系与支持组织成可扫描的层级，而不是把所有内容塞进同一段宣传文案。',
    browserTask(
      'html-css-final-ia-practice',
      '企业服务总览',
      '为企业服务页建立服务对象、核心能力、交付方式和联系入口四个信息层。',
      htmlPage({
        key: 'ia-practice',
        title: '企业数字化服务',
        style: `
      :root { --ink: #1d2b31; --paper: #edf3f2; --panel: #fff; --navy: #1d3b4b; --teal: #19706b; --orange: #a75b20; --line: #aab8b5; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(72rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      .intro { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(15rem, 0.7fr); gap: 1rem; align-items: start; }
      h1 { max-inline-size: 16ch; color: var(--navy); font-size: clamp(2.2rem, 8vw, 5rem); line-height: 1; }
      .contact { padding: 1rem; color: white; background: var(--teal); }
      .contact a { display: inline-flex; min-block-size: 2.75rem; align-items: center; color: white; font-weight: 800; }
      .layers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; margin-block-start: 1rem; }
      .layers article { min-inline-size: 0; padding: 1rem; background: var(--panel); border-top: 0.35rem solid var(--teal); }
      .layers h2 { line-height: 1.25; }
      .delivery { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: 0.5rem 0.8rem; margin-block-start: 1rem; padding: 1rem; background: #fffaf0; border-inline-start: 0.3rem solid var(--orange); }
      .delivery span:first-child { display: grid; place-items: center; inline-size: 2rem; block-size: 2rem; color: white; background: var(--orange); font-weight: 900; }
      .delivery p { margin: 0; }
      @media (max-width: 48rem) { .intro { grid-template-columns: 1fr; } .layers { grid-template-columns: 1fr; } }
      @media (max-width: 26rem) { .delivery { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <section class="intro"><div><p>企业技术服务</p><h1>让复杂系统变成可执行的改进计划</h1><p>从现场诊断到上线复盘，团队用同一套数据口径交付技术方案。</p></div><aside class="contact"><h2>准备开始？</h2><p>提交问题范围，两个工作日内安排初步沟通。</p><a href="#contact">联系方案顾问</a></aside></section>
      <section class="layers" aria-label="服务信息层级">
        <article><p>01 · 服务对象</p><h2>制造业与物流团队</h2><p>关注设备、仓储与订单链路的稳定性。</p></article>
        <article><p>02 · 核心能力</p><h2>诊断、改造与运行</h2><p>把架构、容量和流程问题拆成可验证任务。</p></article>
        <article><p>03 · 证据</p><h2>案例与交付物</h2><p>每阶段都有指标、记录和回滚条件。</p></article>
      </section>
      <section class="delivery"><span>04</span><div><h2>交付方式</h2><p>现场访谈 → 数据采样 → 方案评审 → 灰度实施 → 运行复盘。</p><p id="contact">联系入口：工作日 09:00–17:30，由方案组统一受理。</p></div></section>
    </main>`,
      }),
      '页面按服务对象、核心能力、案例证据、交付方式形成四层信息；宽屏三列、390px 与 320px 单列；联系链接至少 44px 且页面无横向溢出。',
    ),
    browserTask(
      'html-css-final-ia-apply',
      '行业案例详情',
      '为物流企业改造案例建立背景、约束、方案、结果与复盘五个区块，结果区必须包含可核对指标。',
      htmlPage({
        key: 'ia-apply',
        title: '物流调度案例',
        style: `
      :root { --ink: #28251f; --paper: #f4efe5; --panel: #fffdf8; --brown: #5d4230; --rust: #a75422; --green: #2c6650; --line: #b8aa98; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.7 Georgia, "Noto Serif SC", serif; }
      main { width: min(68rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      header { max-inline-size: 50rem; }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1.03; }
      .case { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.8fr); gap: 1rem; align-items: start; }
      .story, .result { min-inline-size: 0; padding: clamp(1rem, 3vw, 2rem); background: var(--panel); border: 1px solid var(--line); }
      .story h2 { color: var(--rust); line-height: 1.2; }
      .story ul { padding-inline-start: 1.2rem; }
      .result { position: sticky; top: 1rem; border-inline-start: 0.35rem solid var(--green); }
      .metric { padding-block: 0.7rem; border-bottom: 1px solid #d3c7b8; }
      .metric strong { display: block; color: var(--green); font-size: clamp(1.7rem, 5vw, 2.6rem); line-height: 1; }
      .retro { margin-block-start: 1rem; padding: 0.8rem; background: #e9f0eb; border-inline-start: 0.3rem solid var(--green); }
      @media (max-width: 45rem) { .case { grid-template-columns: 1fr; } .result { position: static; } }
    `,
        body: `    <main>
      <header><p>案例研究 · 物流调度</p><h1>把人工排队表改成可追踪的波次调度</h1><p>客户：滨河物流 · 范围：华东三仓 · 周期：10 周</p></header>
      <div class="case">
        <article class="story">
          <section><h2>背景</h2><p>订单峰值集中在 09:00 与 16:00，调度员通过群消息确认车辆和拣货进度。</p></section>
          <section><h2>约束</h2><ul><li>不能停机替换仓库管理系统。</li><li>所有计划必须保留人工确认。</li><li>异常时需要一键退回旧队列。</li></ul></section>
          <section><h2>方案</h2><p>先搭只读指标，再把车辆、泊位和拣货任务映射到统一时段；对超时任务给出原因码。</p></section>
          <section><h2>复盘</h2><p>最有效的改动不是新增图表，而是让每个延误事件有责任人和下一次动作。</p></section>
        </article>
        <aside class="result"><h2>结果</h2><div class="metric"><strong>−22%</strong><span>平均等待时间</span></div><div class="metric"><strong>98.4%</strong><span>波次准点率</span></div><div class="metric"><strong>0</strong><span>回滚期间订单丢失</span></div><p class="retro">观察窗口：连续 14 个工作日；统计排除设备维护时段。</p></aside>
      </div>
    </main>`,
      }),
      '案例按背景、约束、方案、结果、复盘组织；结果区三项指标有数字和口径；390px 与 320px 结果区进入普通流，阅读顺序仍为主文后结果；页面无横向溢出。',
    ),
  ),

  'programming:HTML5 · 语义、结构与企业页面骨架：语义重构与回归检查': browserLab(
    '从 div 泥潭到可检查语义',
    '通过地标、标题、列表和表单关系重构页面，同时保留视觉与键盘路径回归。',
    browserTask(
      'html-css-final-refactor-practice',
      '旧公告页语义重构',
      '把仅用 div 和加粗文字表示的公告改为 header、main、article、section 和 h1-h3。',
      htmlPage({
        key: 'refactor-practice',
        title: '园区网络维护公告',
        style: `
      :root { --ink: #202729; --paper: #eef1ef; --panel: #fff; --navy: #213d4c; --orange: #a95d21; --line: #abb5b0; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      header { padding: 1rem clamp(0.8rem, 5vw, 4rem); color: white; background: var(--navy); }
      header h1 { margin: 0; font-size: clamp(1.8rem, 6vw, 3.5rem); }
      main { width: min(54rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      article { padding: clamp(1rem, 4vw, 2rem); background: var(--panel); border: 1px solid var(--line); }
      article > header { padding: 0; color: inherit; background: transparent; }
      article h2 { color: var(--navy); font-size: clamp(1.8rem, 6vw, 3rem); line-height: 1.1; }
      section { margin-block-start: 1.2rem; }
      section h3 { color: var(--orange); }
      ul { padding-inline-start: 1.2rem; }
      aside { margin-block-start: 1rem; padding: 0.8rem; background: #fff4df; border-inline-start: 0.3rem solid var(--orange); }
      .audit { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; margin-block-start: 0.8rem; }
      .audit div { min-inline-size: 0; padding: 0.7rem; background: #e7ece8; border: 1px solid var(--line); overflow-wrap: anywhere; }
      @media (max-width: 36rem) { .audit { grid-template-columns: 1fr; } }
    `,
        body: `    <header><p>园区服务 · 通知</p><h1>网络维护与系统影响说明</h1></header>
    <main>
      <article>
        <header><p><time datetime="2026-11-24">2026 年 11 月 24 日</time></p><h2>11 月 26 日凌晨网络维护</h2><p>维护窗口：02:00–04:00</p></header>
        <section><h3>受影响范围</h3><ul><li>办公楼有线与无线网络。</li><li>测试环境到生产环境的专线。</li><li>自助打印与访客登记终端。</li></ul></section>
        <section><h3>你需要做什么</h3><p>提前保存工作；窗口内不要发起数据库迁移或大文件上传。</p></section>
        <section><h3>恢复确认</h3><p>维护结束后先检查核心页面、打印终端和访客登记，再由服务台解除通知。</p></section>
        <aside><strong>紧急联系</strong><p>如发现网络设备冒烟、异味或异常声响，立即断电并联系园区值班安全员。</p></aside>
      </article>
      <section class="audit" aria-label="语义回归结果"><div>地标：header / main / article</div><div>标题：h1 → h2 → h3</div><div>列表：受影响范围使用 ul</div></section>
    </main>`,
      }),
      '页面有站点 header、唯一 main 和公告 article；标题顺序为 h1、h2、h3；影响范围使用列表，紧急联系使用 aside；320px 审计项单列且页面无横向滚动。',
    ),
    browserTask(
      'html-css-final-refactor-apply',
      '活动页键盘路径回归',
      '重构活动卡和报名入口，加入跳转链接、有名称导航、文章时间和明确表单标签，并展示回归清单。',
      htmlPage({
        key: 'refactor-apply',
        title: '社区活动报名回归',
        style: `
      :root { --ink: #29251f; --paper: #f3eee4; --panel: #fffdf8; --green: #2c634b; --rust: #a24e24; --line: #b4a696; --focus: #d78324; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 Georgia, "Noto Serif SC", serif; }
      .skip { position: absolute; inset-block-start: 0.5rem; inset-inline-start: 0.5rem; z-index: 5; padding: 0.7rem; color: white; background: var(--green); transform: translateY(-180%); }
      .skip:focus { transform: translateY(0); }
      .top { padding: 0.8rem clamp(0.8rem, 5vw, 4rem); color: white; background: var(--green); }
      main { width: min(64rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--green); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
      article { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      time { color: var(--rust); font-variant-numeric: tabular-nums; }
      article a { display: inline-flex; min-block-size: 2.75rem; align-items: center; color: var(--green); font-weight: 800; }
      form { margin-block-start: 0.8rem; padding: 1rem; background: #e9ece3; border-inline-start: 0.3rem solid var(--rust); }
      .field { display: grid; gap: 0.3rem; margin-block: 0.7rem; }
      input, button { min-height: 2.8rem; padding: 0.55rem 0.65rem; border: 1px solid #81786d; font: inherit; }
      button { color: white; background: var(--green); border-color: var(--green); font-weight: 800; }
      :focus-visible { outline: 0.25rem solid var(--focus); outline-offset: 0.15rem; }
      .checklist { margin-block-start: 0.8rem; padding: 0.8rem; background: #fff6e7; border: 1px solid #b89560; }
      @media (max-width: 40rem) { .cards { grid-template-columns: 1fr; } button { inline-size: 100%; } }
    `,
        body: `    <a class="skip" href="#main">跳到主要内容</a>
    <header class="top"><strong>河岸社区活动</strong><nav aria-label="活动导航"><a href="#events">活动列表</a> · <a href="#signup">报名</a></nav></header>
    <main id="main">
      <h1>十一月社区活动</h1>
      <section class="cards" id="events" aria-label="活动列表">
        <article><p><time datetime="2026-11-26T18:30:00+08:00">11 月 26 日 18:30</time></p><h2>木凳加固工作坊</h2><p>从榫接检查到安全上胶。</p><a href="#signup">报名木凳工作坊</a></article>
        <article><p><time datetime="2026-11-28T10:00:00+08:00">11 月 28 日 10:00</time></p><h2>小家电检修</h2><p>先断电，再判断故障范围。</p><a href="#signup">报名检修活动</a></article>
      </section>
      <form id="signup" action="#main"><h2>报名信息</h2><div class="field"><label for="participant">姓名</label><input id="participant" autocomplete="name"></div><div class="field"><label for="phone">联系电话</label><input id="phone" type="tel" autocomplete="tel"></div><button type="submit">提交报名</button></form>
      <p class="checklist">回归：桌面与手机标题顺序一致；Tab 先经过跳转链接；两个活动链接名称不同；表单标签可读。</p>
    </main>`,
      }),
      '跳转链接只在键盘聚焦时出现并指向 main；两个活动链接名称可区分；表单每个输入都有 label；390px 与 320px 卡片单列、按钮满宽；页面无横向滚动。',
    ),
  ),

  'programming:HTML5 · 表单、输入与验证：提交、取消、加载与重复提交': browserLab(
    '表单提交状态机',
    '用 HTML 属性和可见状态表达空闲、提交中、成功和失败，避免重复提交与丢失取消路径。',
    browserTask(
      'html-css-final-submit-practice',
      '设备报修提交中',
      '建立报修表单并展示提交中状态：提交按钮禁用、aria-busy、取消入口和明确等待说明。',
      htmlPage({
        key: 'submit-practice',
        title: '设备报修表',
        style: `
      :root { --ink: #202a2d; --paper: #eef2f1; --panel: #fff; --teal: #17675e; --amber: #9b6110; --line: #a8b6b1; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(48rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      form { padding: clamp(1rem, 4vw, 2rem); background: var(--panel); border: 1px solid var(--line); }
      h1 { color: var(--teal); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      fieldset { padding: 0.9rem; border: 1px solid var(--line); }
      legend { padding-inline: 0.25rem; font-weight: 800; }
      .field { display: grid; gap: 0.3rem; margin-block: 0.7rem; }
      input, textarea { min-height: 2.8rem; padding: 0.55rem 0.65rem; border: 1px solid #81908a; font: inherit; }
      textarea { min-height: 6rem; resize: vertical; }
      .pending { padding: 0.8rem; color: #674008; background: #fff5df; border-inline-start: 0.3rem solid var(--amber); }
      .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-block-start: 0.8rem; }
      button { min-height: 2.9rem; padding-inline: 0.9rem; border: 2px solid var(--teal); font: inherit; font-weight: 800; }
      .primary { color: white; background: var(--teal); }
      button:disabled { color: #515b57; background: #dde4e0; border: 2px dashed #89958f; cursor: not-allowed; }
      @media (max-width: 28rem) { .actions button { inline-size: 100%; } }
    `,
        body: `    <main>
      <form action="#status" aria-busy="true">
        <p>设施服务 · 报修</p><h1>提交设备故障</h1>
        <fieldset><legend>设备信息</legend><div class="field"><label for="asset">设备编号</label><input id="asset" value="PUMP-02"></div><div class="field"><label for="issue">故障现象</label><textarea id="issue">启动后有周期性撞击声，出口压力波动。</textarea></div></fieldset>
        <p class="pending" id="status"><strong>正在提交……</strong><br>请保持页面打开；重复点击不会创建第二张工单。</p>
        <div class="actions"><button class="primary" type="submit" disabled>提交中</button><button type="button">取消提交</button></div>
      </form>
    </main>`,
      }),
      '表单带 aria-busy=true，提交按钮禁用且文字为“提交中”；等待说明明确不会重复创建工单；取消按钮仍可操作；320px 两按钮上下排列，页面无横向溢出。',
    ),
    browserTask(
      'html-css-final-submit-apply',
      '访问申请结果状态',
      '建立权限申请表单并展示失败后重试：保留输入、错误摘要、重试与返回修改路径。',
      htmlPage({
        key: 'submit-apply',
        title: '系统访问申请',
        style: `
      :root { --ink: #23272c; --paper: #f1f2f5; --panel: #fff; --navy: #293c52; --blue: #276584; --red: #933833; --green: #246448; --line: #a9b1ba; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(52rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      .surface { padding: clamp(1rem, 4vw, 2rem); background: var(--panel); border: 1px solid var(--line); border-top: 0.35rem solid var(--red); }
      h1 { color: var(--navy); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .error-summary { padding: 0.85rem; color: #6f2926; background: #fff0ef; border: 1px solid #c58d89; }
      .field { display: grid; gap: 0.3rem; margin-block: 0.75rem; }
      input, select { min-height: 2.8rem; padding: 0.55rem 0.65rem; border: 1px solid #818b95; font: inherit; }
      input[aria-invalid="true"] { border: 2px solid var(--red); border-inline-start-width: 0.45rem; }
      .field-error { color: var(--red); font-weight: 750; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-block-start: 0.8rem; }
      button, .secondary { display: inline-flex; min-height: 2.9rem; align-items: center; justify-content: center; padding-inline: 0.9rem; border: 2px solid var(--blue); font: inherit; font-weight: 800; text-decoration: none; }
      button { color: white; background: var(--blue); }
      .secondary { color: var(--blue); background: white; }
      @media (max-width: 28rem) { .actions button, .actions .secondary { inline-size: 100%; } }
    `,
        body: `    <main>
      <section class="surface">
        <p>权限中心 · 申请失败</p><h1>系统访问申请</h1>
        <div class="error-summary" role="alert"><strong>提交未完成</strong><p>服务暂时不可用，你填写的内容仍保留在这张表单中。</p></div>
        <form action="#result">
          <div class="field"><label for="applicant">申请人</label><input id="applicant" value="周宁" autocomplete="name"></div>
          <div class="field"><label for="system">目标系统</label><select id="system"><option>订单分析</option><option>库存控制</option></select></div>
          <div class="field"><label for="reason">申请原因</label><input id="reason" value="核对华东仓库存差异" aria-invalid="true" aria-describedby="reason-error"><p class="field-error" id="reason-error">原因过短，请补充查询范围和期限。</p></div>
          <div class="actions"><button type="button">重试提交</button><a class="secondary" href="#applicant">返回修改</a></div>
        </form>
        <p id="result">成功后会显示申请编号与审批人。</p>
      </section>
    </main>`,
      }),
      '失败摘要位于表单前且 role=alert；原因字段有 aria-invalid 和文字说明；输入值被保留；重试与返回修改按钮至少 44px；320px 操作按钮单列且不溢出。',
    ),
  ),

  'programming:HTML5 · 表单、输入与验证：可访问表单的完整实验': browserLab(
    '完整可访问表单',
    '将标签、分组、帮助、错误、自动填充和焦点顺序放进一次真实表单流程。',
    browserTask(
      'html-css-final-accessible-form-practice',
      '无障碍活动报名',
      '制作姓名、邮箱、联系电话、场次和饮食要求；必填说明、帮助文本与错误关系都要明确。',
      htmlPage({
        key: 'accessible-form-practice',
        title: '无障碍活动报名',
        style: `
      :root { --ink: #202823; --paper: #eef3ed; --panel: #fff; --green: #24644d; --red: #923832; --gold: #d1842b; --line: #a5b3aa; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(50rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      form { padding: clamp(1rem, 4vw, 2rem); background: var(--panel); border: 1px solid var(--line); }
      h1 { color: var(--green); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .required-note { padding: 0.65rem; background: #e8f0ea; border-inline-start: 0.3rem solid var(--green); }
      fieldset { margin-block: 1rem; padding: 0.9rem; border: 1px solid var(--line); }
      legend { padding-inline: 0.25rem; font-weight: 850; }
      .field { display: grid; gap: 0.3rem; margin-block: 0.75rem; }
      label { font-weight: 800; }
      input, select, textarea { min-height: 2.8rem; padding: 0.55rem 0.65rem; border: 1px solid #7e8c84; font: inherit; }
      textarea { min-height: 5rem; resize: vertical; }
      .help { color: #526158; font-size: 0.9rem; }
      .error { color: var(--red); font-weight: 750; }
      [aria-invalid="true"] { border: 2px solid var(--red); border-inline-start-width: 0.45rem; }
      button { min-height: 2.9rem; padding-inline: 1rem; color: white; background: var(--green); border: 2px solid var(--green); font: inherit; font-weight: 800; }
      :focus-visible { outline: 0.25rem solid var(--gold); outline-offset: 0.15rem; }
      @media (max-width: 29rem) { button { inline-size: 100%; } }
    `,
        body: `    <main>
      <form action="#saved">
        <p>社区活动 · 11 月 26 日</p><h1>活动报名表</h1>
        <p class="required-note"><strong>必填字段</strong> 在标签中标记，错误会在对应输入下方说明。</p>
        <div class="field"><label for="name">姓名 <span aria-hidden="true">*</span></label><input id="name" name="name" autocomplete="name" required aria-describedby="name-help"><span class="help" id="name-help">与签到证件保持一致。</span></div>
        <div class="field"><label for="email">邮箱 <span aria-hidden="true">*</span></label><input id="email" name="email" type="email" autocomplete="email" required value="zhou" aria-invalid="true" aria-describedby="email-error"><span class="error" id="email-error">缺少 @ 域名，请填写完整邮箱。</span></div>
        <div class="field"><label for="phone">联系电话</label><input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel"></div>
        <fieldset><legend>选择场次</legend><label><input type="radio" name="session" checked> 上午 10:00</label><br><label><input type="radio" name="session"> 下午 14:00</label></fieldset>
        <div class="field"><label for="diet">饮食或无障碍需求</label><textarea id="diet" aria-describedby="diet-help"></textarea><span class="help" id="diet-help">可以填写轮椅通道、字幕或餐食要求。</span></div>
        <button type="submit">提交报名</button>
      </form>
      <p id="saved">提交后将显示签到编号。</p>
    </main>`,
      }),
      '每个输入都有清晰 label；必填、帮助和错误通过 aria-describedby 建立关系；场次用 fieldset/legend 分组；Tab 顺序从姓名到提交；320px 下所有控件和按钮不溢出。',
    ),
    browserTask(
      'html-css-final-accessible-form-apply',
      '配送地址与时间窗',
      '建立地址、楼层、时间段和交付说明表单；邮编与电话使用正确输入类型，错误摘要链接到字段。',
      htmlPage({
        key: 'accessible-form-apply',
        title: '大件配送预约',
        style: `
      :root { --ink: #28231e; --paper: #f4eee4; --panel: #fffdf8; --brown: #5f4431; --orange: #a65321; --green: #28624b; --red: #913731; --line: #b4a492; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 Georgia, "Noto Serif SC", serif; }
      main { width: min(54rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      form { padding: clamp(1rem, 4vw, 2rem); background: var(--panel); border: 1px solid var(--line); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .error-summary { padding: 0.8rem; background: #fff0ed; border: 1px solid #c28a84; }
      .error-summary a { display: inline-flex; min-block-size: 2.75rem; align-items: center; color: var(--red); font-weight: 800; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
      .field { display: grid; gap: 0.3rem; margin-block: 0.65rem; }
      label { font-weight: 800; }
      input, select, textarea { min-height: 2.8rem; padding: 0.55rem 0.65rem; border: 1px solid #807465; background: white; font: inherit; }
      textarea { min-height: 5rem; resize: vertical; }
      [aria-invalid="true"] { border: 2px solid var(--red); border-inline-start-width: 0.45rem; }
      .help, .hint { color: #685e52; font-size: 0.9rem; }
      .error { color: var(--red); font-weight: 750; }
      button { min-height: 2.9rem; padding-inline: 1rem; color: white; background: var(--green); border: 2px solid var(--green); font: inherit; font-weight: 800; }
      :focus-visible { outline: 0.25rem solid var(--orange); outline-offset: 0.16rem; }
      @media (max-width: 35rem) { .grid { grid-template-columns: 1fr; } button { inline-size: 100%; } }
    `,
        body: `    <main>
      <form action="#confirmation">
        <p>大件配送 · 预约</p><h1>确认送货地址与时间</h1>
        <div class="error-summary" role="alert"><strong>请修正 1 项</strong><p><a href="#postal">跳到邮编错误</a></p></div>
        <div class="grid">
          <div class="field"><label for="recipient">收件人</label><input id="recipient" autocomplete="name" value="周宁"></div>
          <div class="field"><label for="phone">手机号</label><input id="phone" type="tel" inputmode="tel" autocomplete="tel" value="13800002418"></div>
        </div>
        <div class="field"><label for="address">街道地址</label><input id="address" autocomplete="street-address" value="东港路 18 号滨河物流二号门"></div>
        <div class="grid">
          <div class="field"><label for="floor">楼层与门牌</label><input id="floor" value="行政楼 3 层 302"></div>
          <div class="field"><label for="postal">邮编</label><input id="postal" inputmode="numeric" autocomplete="postal-code" value="20" aria-invalid="true" aria-describedby="postal-error"><span class="error" id="postal-error">邮编应为 6 位数字。</span></div>
        </div>
        <div class="field"><label for="window">期望时间窗</label><select id="window"><option>11 月 26 日 09:00–12:00</option><option>11 月 26 日 14:00–17:00</option></select></div>
        <div class="field"><label for="notes">交付说明</label><textarea id="notes" aria-describedby="notes-hint">请从二号门进入，提前 15 分钟联系前台。</textarea><span class="hint" id="notes-hint">不要在此填写密码或支付信息。</span></div>
        <button type="submit">提交预约</button>
      </form>
      <p id="confirmation">成功后显示配送单号和时间窗。</p>
    </main>`,
      }),
      '错误摘要中的链接能跳到邮编字段；电话、邮编使用正确 inputmode/autocomplete；所有帮助文本有关联；390px 与 320px 两列字段变单列，按钮满宽且页面无溢出。',
    ),
  ),

  'programming:HTML5 · 可访问性、SEO 与国际化：对比度、缩放与动效偏好': browserLab(
    '可读性与用户偏好',
    '建立高对比文本、可缩放布局和 reduced-motion/forced-colors 回退。',
    browserTask(
      'html-css-final-preference-practice',
      '高对比通知卡',
      '为成功、警告和错误通知设计文本、边框和图标；在放大与强制色彩下仍能区分。',
      htmlPage({
        key: 'preference-practice',
        title: '系统通知可读性',
        style: `
      :root { --ink: #17201d; --paper: #eff3ef; --panel: #fff; --green: #165d44; --amber: #7b4b08; --red: #842d2a; --line: #9eaaa2; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(58rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: #173f31; font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .notices { display: grid; gap: 0.7rem; }
      .notice { display: grid; grid-template-columns: 2.2rem minmax(0, 1fr); gap: 0.7rem; padding: 1rem; background: var(--panel); border: 2px solid currentColor; }
      .notice .icon { display: grid; place-items: center; inline-size: 2.2rem; block-size: 2.2rem; color: white; background: currentColor; font-weight: 900; }
      .success { color: var(--green); background: #edf7f1; }
      .warning { color: var(--amber); background: #fff6e5; }
      .error { color: var(--red); background: #fff0ef; border-style: dashed; }
      .notice h2, .notice p { color: var(--ink); }
      .notice h2 { margin: 0; }
      .focus-demo { margin-block-start: 0.8rem; padding: 0.8rem; background: #e5ebe7; border-inline-start: 0.3rem solid #345f4e; }
      @media (prefers-contrast: more) { .notice { border-width: 3px; } .notice .icon { outline: 2px solid CanvasText; } }
      @media (forced-colors: active) { .notice { border-color: CanvasText; background: Canvas; } .notice .icon { color: ButtonText; background: ButtonFace; border: 2px solid ButtonText; } }
      @media (max-width: 30rem) { .notice { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>账户安全 · 通知</p><h1>状态不仅靠颜色</h1>
      <section class="notices" aria-label="系统通知">
        <article class="notice success"><span class="icon" aria-hidden="true">✓</span><div><h2>备份完成</h2><p>最近一次全量备份已通过恢复校验。</p></div></article>
        <article class="notice warning"><span class="icon" aria-hidden="true">!</span><div><h2>额度接近上限</h2><p>本周期对象存储已使用 86%，建议清理旧构建。</p></div></article>
        <article class="notice error"><span class="icon" aria-hidden="true">×</span><div><h2>同步失败</h2><p>设备连接已断开，记录仍保存在本机。</p></div></article>
      </section>
      <p class="focus-demo">强制色彩模式下，通知仍保留标题、图标、边框与文字说明；页面放大 200% 后卡片自动增高。</p>
    </main>`,
      }),
      '三种通知都有不同图标、标题和边框；正文与背景对比清楚；forced-colors 使用系统色；200% 缩放与 320px 单列时不裁切，页面无横向滚动。',
    ),
    browserTask(
      'html-css-final-preference-apply',
      '减少动态的进度卡',
      '制作默认旋转进度和 reduced-motion 静态进度；两种模式都显示具体阶段与百分比。',
      htmlPage({
        key: 'preference-apply',
        title: '数据恢复进度',
        style: `
      :root { --ink: #1b2932; --paper: #edf3f5; --panel: #fff; --blue: #21637d; --green: #236348; --amber: #955f0d; --line: #a7b3ba; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(56rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--blue); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .progress { display: grid; grid-template-columns: 4rem minmax(0, 1fr) auto; gap: 0.8rem; align-items: center; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .spinner { inline-size: 3rem; aspect-ratio: 1; border: 0.38rem solid #bed3dc; border-top-color: var(--blue); border-radius: 50%; animation: spin 1s linear infinite; }
      .copy { min-inline-size: 0; }
      .copy h2 { margin: 0; }
      .bar { height: 0.65rem; margin-block-start: 0.6rem; background: #dbe4e7; }
      .bar span { display: block; inline-size: 64%; block-size: 100%; background: var(--blue); }
      .percent { color: var(--blue); font-size: 1.7rem; font-variant-numeric: tabular-nums; font-weight: 900; }
      .note { margin-block-start: 0.8rem; padding: 0.8rem; background: #fff5df; border-inline-start: 0.3rem solid var(--amber); }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spinner { animation: none; border-color: var(--blue); box-shadow: inset 0 0 0 0.35rem #d7e9ef; } .copy::before { content: "静态进度 · "; color: var(--green); } }
      @media (max-width: 32rem) { .progress { grid-template-columns: 3rem minmax(0, 1fr); } .percent { grid-column: 1 / -1; } .spinner { inline-size: 2.6rem; } }
    `,
        body: `    <main>
      <p>备份中心 · 恢复任务</p><h1>正在恢复客户资料</h1>
      <section class="progress" aria-label="恢复进度 64%">
        <span class="spinner" aria-hidden="true"></span>
        <div class="copy"><h2>阶段：校验索引</h2><p>已完成 18,420 / 28,780 个对象。</p><div class="bar"><span></span></div></div>
        <span class="percent">64%</span>
      </section>
      <p class="note">开启“减少动态效果”后，旋转环停止并改为静态内圈，但阶段、数量和百分比保持不变。</p>
    </main>`,
      }),
      '默认模式旋转环持续运动；减少动态模式动画为 none 并出现静态标记；两种模式都显示阶段、对象数量和 64%；320px 百分比换到下一行且页面无横向溢出。',
    ),
  ),

  'programming:HTML5 · 可访问性、SEO 与国际化：无障碍与 SEO 联合验收': browserLab(
    '无障碍与搜索共同基础',
    '让可读标题、链接文本、结构化内容和页面元数据服务真实用户，也服务可靠抓取。',
    browserTask(
      'html-css-final-a11y-seo-practice',
      '帮助中心文章验收',
      '为数据库恢复文章建立 title、description、canonical、单一 h1、目录和可理解链接。',
      htmlPage({
        key: 'a11y-seo-practice',
        title: '数据库恢复检查指南',
        style: `
      :root { --ink: #1e2824; --paper: #f0f4ef; --panel: #fff; --green: #206348; --orange: #a35720; --line: #a8b4aa; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.7 system-ui, sans-serif; }
      .skip { position: absolute; inset-block-start: 0.5rem; inset-inline-start: 0.5rem; z-index: 4; padding: 0.7rem; color: white; background: var(--green); transform: translateY(-180%); }
      .skip:focus { transform: translateY(0); }
      header { padding: 0.9rem clamp(0.8rem, 5vw, 4rem); color: white; background: var(--green); }
      main { display: grid; grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr); gap: 1rem; width: min(68rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      nav { align-self: start; padding: 0.8rem; background: var(--panel); border: 1px solid var(--line); }
      nav a { display: flex; min-block-size: 2.75rem; align-items: center; color: var(--green); }
      article { min-inline-size: 0; padding: clamp(1rem, 3vw, 2rem); background: var(--panel); border: 1px solid var(--line); }
      h1 { color: var(--green); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      section { padding-block: 1rem; border-top: 1px solid #d4ddd5; }
      .meta { padding: 0.8rem; background: #e8efe9; border-inline-start: 0.3rem solid var(--orange); }
      code { overflow-wrap: anywhere; }
      @media (max-width: 43rem) { main { grid-template-columns: 1fr; } nav { position: static; } nav ul { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.3rem; padding: 0; list-style: none; } nav a { justify-content: center; text-align: center; } }
      @media (max-width: 27rem) { nav ul { grid-template-columns: 1fr; } }
    `,
        body: `    <a class="skip" href="#main">跳到文章</a>
    <header><strong>云岸技术帮助中心</strong></header>
    <main id="main">
      <nav aria-label="文章目录"><h2>本文目录</h2><ul><li><a href="#prepare">准备恢复</a></li><li><a href="#verify">验证数据</a></li><li><a href="#open">恢复访问</a></li></ul></nav>
      <article>
        <p>数据库 · 运行手册</p><h1>数据库恢复后必须完成的检查</h1>
        <p class="meta"><time datetime="2026-11-24">更新于 2026 年 11 月 24 日</time> · 约 8 分钟</p>
        <p>恢复数据库不等于服务已经可用。本文按准备、验证和开放访问三个阶段说明最低检查项。</p>
        <section id="prepare"><h2>准备恢复</h2><p>先确认备份版本、恢复目标和停止条件，再记录开始时间与执行人。</p></section>
        <section id="verify"><h2>验证数据</h2><p>核对关键表行数、约束与最近事务；执行只读查询，不直接接生产流量。</p><p><code>SELECT COUNT(*) FROM orders WHERE created_at &gt;= :window_start;</code></p></section>
        <section id="open"><h2>恢复访问</h2><p>先放行内部只读流量，再逐步恢复写入，并连续观察错误率与延迟。</p><p><a href="#prepare">返回准备恢复检查</a></p></section>
      </article>
    </main>`,
      }),
      '页面只有一个 h1，title 与 h1 主题一致；目录有名称且链接可理解；canonical、description 在 head 中；390px 与 320px 目录改为可点击单列，页面无横向滚动。',
    ),
    browserTask(
      'html-css-final-a11y-seo-apply',
      '服务价格页联合审计',
      '制作价格页并展示无障碍与 SEO 验收表：标题、描述、robots、价格结构、表单标签和链接。',
      htmlPage({
        key: 'a11y-seo-apply',
        title: '企业服务价格与交付',
        style: `
      :root { --ink: #26231e; --paper: #f4eee5; --panel: #fffdf8; --brown: #5b4230; --orange: #a34f20; --green: #28634b; --line: #b5a695; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 Georgia, "Noto Serif SC", serif; }
      main { width: min(68rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      header { max-inline-size: 48rem; }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1.04; }
      .plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
      .plan { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .plan h2 { color: var(--green); }
      .price { display: block; margin-block: 0.4rem; color: var(--orange); font-size: clamp(1.7rem, 5vw, 2.5rem); line-height: 1; font-weight: 800; }
      .plan a, .plan button { display: inline-flex; min-block-size: 2.8rem; align-items: center; color: var(--green); font: inherit; font-weight: 800; }
      .audit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; margin-block-start: 0.9rem; padding: 0.8rem; background: #e8ede7; border-inline-start: 0.3rem solid var(--orange); }
      .audit p { margin: 0; }
      code { overflow-wrap: anywhere; }
      @media (max-width: 46rem) { .plans { grid-template-columns: 1fr; } }
      @media (max-width: 27rem) { .audit { grid-template-columns: 1fr; } .plan button { inline-size: 100%; justify-content: center; } }
    `,
        body: `    <main>
      <header><p>企业技术服务 · 透明价格</p><h1>按交付范围选择服务方案</h1><p>每个方案都说明响应时间、交付材料和回滚支持。</p></header>
      <section class="plans" aria-label="服务方案">
        <article class="plan"><h2>诊断</h2><span class="price">¥ 8,000</span><p>3 个工作日 · 一份问题清单</p><a href="#contact">了解诊断服务</a></article>
        <article class="plan"><h2>改造</h2><span class="price">按范围报价</span><p>含方案评审、灰度与运行手册</p><a href="#contact">获取改造评估</a></article>
        <article class="plan"><h2>托管</h2><span class="price">每月 ¥ 16,000</span><p>监控、值班与月度复盘</p><button type="button">申请服务说明</button></article>
      </section>
      <section class="audit" aria-label="联合验收结果"><p><strong>SEO</strong> <code>title + description + canonical</code></p><p><strong>标题</strong> 单一 h1，方案使用 h2</p><p><strong>链接</strong> 每个动作说明目标</p><p><strong>价格</strong> 数字、币种和周期都写入正文</p></section>
      <p id="contact">服务申请由方案组在下一个工作日确认。</p>
    </main>`,
      }),
      '标题层级为 h1 后接三个 h2；三个方案动作名称均可独立理解；价格包含币种和周期；320px 方案与审计表单列，按钮满宽且页面无横向溢出。',
    ),
  ),

  'programming:HTML5 · 页面性能与企业站点交付：预加载、懒加载与资源提示': browserLab(
    '资源优先级与加载策略',
    '用预算、尺寸占位和优先级表判断哪些资源先加载、哪些延后，以及提示何时会成为反效果。',
    browserTask(
      'html-css-final-resource-hints-practice',
      '首屏资源预算板',
      '为首屏主图、样式、折叠图片和下一步页面列用途、优先级与失败回退。',
      htmlPage({
        key: 'resource-hints-practice',
        title: '首屏资源预算',
        style: `
      :root { --ink: #19272c; --paper: #edf3f4; --panel: #fff; --blue: #1e627e; --green: #24644a; --amber: #95600e; --line: #a8b5bb; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(68rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--blue); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .budget { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; margin-block: 0.8rem; }
      .budget div { min-inline-size: 0; padding: 0.8rem; background: var(--panel); border: 1px solid var(--line); }
      .budget strong { display: block; color: var(--blue); font-size: clamp(1.5rem, 5vw, 2.2rem); line-height: 1.1; }
      .table-shell { max-inline-size: 100%; overflow-x: auto; border: 1px solid var(--line); background: white; }
      table { width: 100%; min-width: 42rem; border-collapse: collapse; }
      th, td { padding: 0.75rem; border-bottom: 1px solid var(--line); text-align: left; }
      code { overflow-wrap: anywhere; }
      .hint { margin-block-start: 0.8rem; padding: 0.8rem; color: #614008; background: #fff5df; border-inline-start: 0.3rem solid var(--amber); }
      @media (max-width: 45rem) { .budget { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>企业官网 · 首屏预算</p><h1>资源顺序不是越多提示越好</h1>
      <section class="budget" aria-label="首屏预算"><div><span>初始 HTML</span><strong>24 KB</strong></div><div><span>关键 CSS</span><strong>38 KB</strong></div><div><span>首屏图片</span><strong>180 KB</strong></div></section>
      <div class="table-shell" tabindex="0" role="region" aria-label="资源优先级表">
        <table><thead><tr><th>资源</th><th>策略</th><th>优先级</th><th>失败回退</th></tr></thead><tbody>
          <tr><td>入口 HTML</td><td>短缓存，重新验证</td><td>最高</td><td>显示服务状态页</td></tr>
          <tr><td>主图</td><td>尺寸占位 + preload</td><td>高</td><td>保留文字与背景色</td></tr>
          <tr><td>折叠图片</td><td>loading=lazy</td><td>低</td><td>进入视口再请求</td></tr>
          <tr><td>下一步页面</td><td>意图触发 prefetch</td><td>最低</td><td>普通导航继续可用</td></tr>
        </tbody></table>
      </div>
      <p class="hint">预加载只用于确定会出现的首屏资源；未使用提示或重复下载会让主图更慢。</p>
    </main>`,
      }),
      '预算表显示 HTML、CSS、图片三项；资源表列出高到低四种策略与失败回退；320px 表格仅在自身滚动；页面本身无横向溢出，提示文本完整可见。',
    ),
    browserTask(
      'html-css-final-resource-hints-apply',
      '折叠内容加载策略',
      '制作文章和媒体卡片，用尺寸占位、lazy 文案和用户意图预取说明展示资源延迟加载决策。',
      htmlPage({
        key: 'resource-hints-apply',
        title: '城市更新专题',
        style: `
      :root { --ink: #28231d; --paper: #f4eee3; --panel: #fffdf8; --brown: #5c4230; --orange: #a75320; --green: #2a634a; --line: #b5a493; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.7 Georgia, "Noto Serif SC", serif; }
      main { width: min(68rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1.04; }
      .lead { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(15rem, 0.7fr); gap: 0.8rem; align-items: start; }
      .lead article, aside { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .art-placeholder { display: grid; place-items: center; min-block-size: 12rem; margin-block: 0.8rem; color: #6c5543; background: linear-gradient(145deg, #dfd0bd, #b9c9ba); border: 1px solid #9b8976; text-align: center; }
      aside { border-inline-start: 0.3rem solid var(--orange); }
      dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.4rem 0.7rem; }
      dt { font-weight: 800; } dd { margin: 0; overflow-wrap: anywhere; }
      .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.7rem; margin-block-start: 0.8rem; }
      .cards article { min-inline-size: 0; padding: 0.9rem; background: var(--panel); border-top: 0.3rem solid var(--green); }
      .cards h2 { line-height: 1.25; }
      .lazy { color: #5d665e; font: 0.82rem/1.5 system-ui, sans-serif; }
      code { overflow-wrap: anywhere; }
      @media (max-width: 46rem) { .lead, .cards { grid-template-columns: 1fr; } }
      @media (max-width: 27rem) { dl { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>专题 · 城市更新</p><h1>旧厂房如何变成可步行的社区空间</h1>
      <div class="lead">
        <article><div class="art-placeholder" role="img" aria-label="旧厂房更新后的中庭示意图"><strong>首屏主图占位</strong><span>960 × 540 · 预留宽高比</span></div><p>项目先保留承重结构，再把装卸区改为步行入口，并在阴影较重的一侧布置公共座椅。</p><p class="lazy"><code>fetchpriority="high" decoding="async" width="960" height="540"</code></p></article>
        <aside><h2>加载决策</h2><dl><dt>主图</dt><dd>高优先级，尺寸占位</dd><dt>折叠照片</dt><dd>lazy，接近视口再取</dd><dt>下一步报告</dt><dd>鼠标悬停或键盘聚焦再 prefetch</dd><dt>失败回退</dt><dd>保留标题、摘要和替代说明</dd></dl></aside>
      </div>
      <section class="cards"><article><p class="lazy">进入视口后加载</p><h2>旧仓库的采光改造</h2><p>比较天窗、侧窗和导光板对眩光的影响。</p></article><article><p class="lazy">进入视口后加载</p><h2>保留结构的三次检测</h2><p>记录裂缝、锈蚀和荷载变化。</p></article><article><p class="lazy">用户意图预取</p><h2>下一步：运营维护清单</h2><p>只在用户聚焦时准备下一页。</p></article></section>
    </main>`,
      }),
      '主图占位保留 16:9 空间；折叠卡显示 lazy 和意图预取文案；390px 与 320px 主区和卡片单列；所有代码与说明可换行，页面无横向滚动。',
    ),
  ),

  'programming:HTML5 · 页面性能与企业站点交付：第三方脚本、CSP 与隐私边界': browserLab(
    '第三方资源与内容安全',
    '为分析、支付和客服组件登记用途、权限、失败路径，并用 CSP 与完整性信息表达边界。',
    browserTask(
      'html-css-final-third-party-web-practice',
      '第三方资源登记表',
      '列出分析、支付、客服和地图组件；每项说明 Cookie、数据范围、失败回退与所有者。',
      htmlPage({
        key: 'third-party-web-practice',
        title: '第三方资源登记',
        style: `
      :root { --ink: #20282d; --paper: #edf2f3; --panel: #fff; --navy: #243e50; --blue: #246882; --amber: #96600e; --red: #913934; --line: #a8b3ba; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.6 system-ui, sans-serif; }
      main { width: min(70rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--navy); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .table-shell { max-inline-size: 100%; overflow-x: auto; border: 1px solid var(--line); background: white; }
      table { width: 100%; min-width: 48rem; border-collapse: collapse; }
      caption { padding: 0.8rem; text-align: left; font-weight: 850; background: #e7edef; }
      th, td { padding: 0.75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      .policy { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; margin-block-start: 0.8rem; }
      .policy div { min-inline-size: 0; padding: 0.8rem; background: var(--panel); border-inline-start: 0.3rem solid var(--blue); }
      code { overflow-wrap: anywhere; font-size: 0.85rem; }
      .warning { color: #623d08; background: #fff5df; border-inline-start-color: var(--amber); }
      @media (max-width: 42rem) { .policy { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>隐私与安全 · 供应商清单</p><h1>第三方资源登记</h1>
      <div class="table-shell" tabindex="0" role="region" aria-label="第三方资源登记表">
        <table><caption>页面可加载组件与回退路径</caption><thead><tr><th>组件</th><th>用途</th><th>Cookie</th><th>数据范围</th><th>失败回退</th><th>所有者</th></tr></thead><tbody>
          <tr><td>analytics</td><td>页面访问统计</td><td>否</td><td>路径、设备类型</td><td>直接跳过</td><td>增长组</td></tr>
          <tr><td>payment</td><td>企业卡付款</td><td>是</td><td>支付表单、订单号</td><td>电话下单</td><td>结算组</td></tr>
          <tr><td>support-chat</td><td>人工客服</td><td>是</td><td>会话内容</td><td>邮件入口</td><td>客户成功</td></tr>
          <tr><td>map</td><td>门店位置</td><td>否</td><td>大致区域</td><td>文字地址</td><td>门店运营</td></tr>
        </tbody></table>
      </div>
      <section class="policy"><div><h2>CSP 要求</h2><code>default-src 'self'; object-src 'none'; base-uri 'none'</code></div><div class="warning"><h2>核心任务不可依赖</h2><p>支付或客服失败时，电话与邮件出口必须仍可见。</p></div></section>
    </main>`,
      }),
      '登记表包含四类组件、Cookie 与失败回退；表格可聚焦并局部滚动；320px 页面本身无横向溢出；CSP 与核心任务回退说明完整显示。',
    ),
    browserTask(
      'html-css-final-third-party-web-apply',
      '客服组件失败页',
      '模拟客服组件不可用：保留订单查询、邮件与电话出口，并展示 CSP 报告摘要。',
      htmlPage({
        key: 'third-party-web-apply',
        title: '客服组件不可用',
        style: `
      :root { --ink: #29251f; --paper: #f4eee4; --panel: #fffdf8; --brown: #5c4331; --rust: #a04c20; --green: #28634b; --line: #b5a593; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 Georgia, "Noto Serif SC", serif; }
      main { width: min(60rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4.2rem); line-height: 1.04; }
      .layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.8fr); gap: 0.8rem; align-items: start; }
      .primary, .csp { min-inline-size: 0; padding: clamp(1rem, 3vw, 2rem); background: var(--panel); border: 1px solid var(--line); }
      .failed { padding: 0.8rem; color: #6d2b27; background: #fff0ee; border: 1px dashed #a96560; }
      .fallbacks { display: grid; gap: 0.6rem; margin-block-start: 0.8rem; }
      .fallbacks a, .fallbacks button { display: flex; min-block-size: 2.9rem; align-items: center; justify-content: center; padding: 0.6rem; border: 2px solid var(--green); color: var(--green); background: white; font: inherit; font-weight: 800; text-decoration: none; }
      .fallbacks .phone { color: white; background: var(--green); }
      .csp { border-inline-start: 0.3rem solid var(--rust); }
      code { overflow-wrap: anywhere; }
      @media (max-width: 44rem) { .layout { grid-template-columns: 1fr; } }
      @media (max-width: 27rem) { .fallbacks a, .fallbacks button { inline-size: 100%; } }
    `,
        body: `    <main>
      <p>客户支持 · 服务状态</p><h1>在线客服暂时不可用</h1>
      <div class="layout">
        <section class="primary"><p class="failed" role="status"><strong>客服组件加载失败</strong><br>订单和账户数据没有受到影响。</p><h2>仍然可以联系我们</h2><div class="fallbacks"><a class="phone" href="#phone">拨打 400-800-2418</a><a href="#email">发送邮件给支持团队</a><button type="button">复制问题编号 CS-1842</button></div></section>
        <aside class="csp"><h2>报告摘要</h2><dl><dt>组件</dt><dd>support-chat</dd><dt>状态</dt><dd>blocked by policy</dd><dt>失败动作</dt><dd>显示邮件与电话</dd></dl><p><code>script-src 'self'; frame-src 'none'</code></p></aside>
      </div>
      <p id="email">支持邮箱：support@cloudbank.example（仅作为示例文本）。</p>
      <p id="phone">服务时间：每天 08:00–22:00。</p>
    </main>`,
      }),
      '客服失败后电话、邮件和问题编号仍可操作；组件状态与 CSP 摘要可见；390px 与 320px 主区和报告单列；按钮高度至少 44px，页面无横向溢出。',
    ),
  ),

  'programming:HTML5 · 页面性能与企业站点交付：缓存、压缩与 CDN 静态发布': browserLab(
    '缓存身份与发布顺序',
    '根据入口与指纹资源区分缓存时间，展示压缩、条件请求和安全发布顺序。',
    browserTask(
      'html-css-final-cache-practice',
      '入口与指纹资源缓存表',
      '列出 index.html、带哈希 CSS、无哈希图片和用户私有响应的缓存头与验证方式。',
      htmlPage({
        key: 'cache-practice',
        title: '静态缓存策略',
        style: `
      :root { --ink: #1a262d; --paper: #edf2f5; --panel: #fff; --navy: #203c53; --cyan: #1e7185; --green: #25644b; --amber: #94600e; --line: #a6b2ba; }
      body { color: var(--ink); background: var(--paper); font: 1.1rem/1.7 ui-monospace, "Cascadia Code", monospace; }
      main { width: min(72rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--navy); font-size: clamp(1.9rem, 6vw, 3.6rem); line-height: 1.08; font-family: system-ui, sans-serif; }
      .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; }
      .card { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .card h2 { color: var(--cyan); font-family: system-ui, sans-serif; }
      .card p { overflow-wrap: anywhere; }
      .entry { border-inline-start: 0.3rem solid var(--amber); }
      .asset { border-inline-start: 0.3rem solid var(--green); }
      .flow { margin-block-start: 0.8rem; padding: 0.8rem; background: #fff5df; border-inline-start: 0.3rem solid var(--amber); }
      @media (max-width: 42rem) { .cards { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>静态站点 · 缓存决策</p><h1>入口短缓存，指纹资源长缓存</h1>
      <section class="cards">
        <article class="card entry"><h2>入口 HTML</h2><p>Cache-Control: public, max-age=0, must-revalidate</p><p>响应带 ETag；内容变化后条件请求返回新的 200。</p></article>
        <article class="card asset"><h2>带哈希 CSS</h2><p>assets/app.4d91c2.css</p><p>Cache-Control: public, max-age=31536000, immutable</p></article>
        <article class="card"><h2>无哈希图片</h2><p>media/hero.webp</p><p>短缓存并按 ETag 或 Last-Modified 重新验证。</p></article>
        <article class="card"><h2>用户私有响应</h2><p>Cache-Control: private, no-store</p><p>不得进入共享 CDN，也不得在浏览器中长期保存。</p></article>
      </section>
      <p class="flow">首次入口 200 → 未变化时 304 → 新发布入口重新验证 → 新哈希资源单独缓存。</p>
    </main>`,
      }),
      '四类缓存对象分别有明确头与验证方式；入口和指纹资源边界可区分；390px 与 320px 卡片单列；缓存值可换行，页面无横向溢出。',
    ),
    browserTask(
      'html-css-final-cache-apply',
      '发布与回滚顺序',
      '展示指纹资源先上传、入口后切换、CDN 失效和回滚清单；用状态节点表示每一步。',
      htmlPage({
        key: 'cache-apply',
        title: '静态站点发布记录',
        style: `
      :root { --ink: #26231e; --paper: #f3eee4; --panel: #fffdf8; --brown: #5a4130; --orange: #a45120; --green: #28634a; --red: #923833; --line: #b4a493; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(66rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .release { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.8fr); gap: 0.8rem; align-items: start; }
      .steps, .rollback { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .steps ol { display: grid; gap: 0.7rem; padding: 0; list-style: none; }
      .steps li { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; gap: 0.6rem; align-items: start; padding: 0.7rem; border-inline-start: 0.3rem solid var(--green); background: #edf4ef; }
      .steps .done { color: var(--green); font-weight: 850; }
      .steps .wait { color: var(--orange); font-weight: 850; }
      .rollback { border-inline-start: 0.3rem solid var(--red); }
      code { overflow-wrap: anywhere; }
      @media (max-width: 44rem) { .release { grid-template-columns: 1fr; } }
      @media (max-width: 27rem) { .steps li { grid-template-columns: 1.5rem minmax(0, 1fr); } .steps li > :last-child { grid-column: 2; } }
    `,
        body: `    <main>
      <p>静态站点 · release 2026.11.24.7</p><h1>发布与回滚顺序</h1>
      <div class="release">
        <section class="steps"><h2>发布步骤</h2><ol>
          <li><span>1</span><div><strong>上传指纹资源</strong><p><code>/assets/app.4d91c2.css</code></p></div><span class="done">完成</span></li>
          <li><span>2</span><div><strong>检查压缩与 MIME</strong><p>CSS 使用 text/css 与 Brotli，图片不重复压缩。</p></div><span class="done">完成</span></li>
          <li><span>3</span><div><strong>切换入口 HTML</strong><p>短缓存并重新验证。</p></div><span class="wait">等待</span></li>
          <li><span>4</span><div><strong>清理入口缓存</strong><p>只失效 index.html。</p></div><span>待执行</span></li>
        </ol></section>
        <aside class="rollback"><h2>回滚清单</h2><p><code>previous-manifest.4d22f1.json</code></p><p>恢复入口 HTML，保留旧指纹资源，再冒烟首页、价格页和联系页。</p><p>若新入口已缓存，需要按 CDN 失效结果重新检查最终 URL。</p></aside>
      </div>
    </main>`,
      }),
      '四步发布顺序从指纹资源到入口切换再到缓存失效；完成与等待状态有文字和边框；回滚清单包含 manifest 和三个冒烟页面；320px 步骤改为两列且无横向溢出。',
    ),
  ),

  'programming:HTML5 · 页面性能与企业站点交付：Web Vitals、真实用户监控与回归': browserLab(
    '体验指标与回归证据',
    '将 LCP、CLS、INP、TTFB 映射到具体问题和发布门槛，并保留资源与页面模板证据。',
    browserTask(
      'html-css-final-vitals-practice',
      '四指标诊断板',
      '展示 LCP、CLS、INP 和 TTFB 的当前值、目标值、受影响模板与首要排查方向。',
      htmlPage({
        key: 'vitals-practice',
        title: 'Web Vitals 诊断',
        style: `
      :root { --ink: #19262d; --paper: #edf3f5; --panel: #fff; --navy: #20384b; --blue: #216a86; --green: #236447; --amber: #96600c; --red: #913a35; --line: #a7b3bb; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.55 system-ui, sans-serif; }
      main { width: min(72rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--navy); font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; }
      .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.6rem; }
      .metric { min-inline-size: 0; padding: 0.9rem; background: var(--panel); border: 1px solid var(--line); border-top: 0.3rem solid var(--green); }
      .metric.warn { border-top-color: var(--amber); }
      .metric.bad { border-top-color: var(--red); }
      .metric strong { display: block; color: var(--blue); font-size: clamp(1.6rem, 5vw, 2.6rem); line-height: 1; font-variant-numeric: tabular-nums; }
      .metric h2, .metric p { margin-block: 0.35rem; }
      .evidence { margin-block-start: 0.8rem; padding: 0.8rem; background: #e7eef1; border-inline-start: 0.3rem solid var(--blue); }
      .evidence li { overflow-wrap: anywhere; }
      @media (max-width: 48rem) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 28rem) { .metrics { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>RUM · 价格页 · 移动端 P75</p><h1>四个指标指向四个问题</h1>
      <section class="metrics" aria-label="Web Vitals 指标">
        <article class="metric warn"><h2>LCP</h2><strong>2.6 s</strong><p>目标 ≤ 2.5 s</p><p>首屏主图较晚完成。</p></article>
        <article class="metric"><h2>CLS</h2><strong>0.06</strong><p>目标 ≤ 0.10</p><p>价格卡尺寸稳定。</p></article>
        <article class="metric bad"><h2>INP</h2><strong>240 ms</strong><p>目标 ≤ 200 ms</p><p>筛选交互主线程繁忙。</p></article>
        <article class="metric"><h2>TTFB</h2><strong>480 ms</strong><p>目标 ≤ 600 ms</p><p>入口缓存命中正常。</p></article>
      </section>
      <section class="evidence"><h2>证据链</h2><ul><li>模板：pricing / mobile / anonymous</li><li>资源：主图 start=920ms, duration=1340ms</li><li>发布：2026.11.24.3 → 2026.11.24.7</li><li>动作：连续两个窗口超限时阻断放量。</li></ul></section>
    </main>`,
      }),
      '四个指标均显示当前值、目标和排查方向；LCP、INP 超限状态清楚；390px 指标两列、320px 单列；证据链可换行且页面无横向滚动。',
    ),
    browserTask(
      'html-css-final-vitals-apply',
      '发布回归时间线',
      '制作一次版本回归：基线、发现问题、修复、复测和放量门槛；每步要有指标证据。',
      htmlPage({
        key: 'vitals-apply',
        title: '体验指标发布回归',
        style: `
      :root { --ink: #27231f; --paper: #f3eee5; --panel: #fffdf8; --brown: #5d4331; --orange: #a35220; --green: #28634a; --red: #913934; --line: #b5a594; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.7 Georgia, "Noto Serif SC", serif; }
      main { width: min(66rem, 100%); margin-inline: auto; padding: clamp(0.8rem, 4vw, 3rem); }
      h1 { color: var(--brown); font-size: clamp(2rem, 7vw, 4.2rem); line-height: 1.04; }
      .timeline { display: grid; gap: 0.7rem; padding: 0; list-style: none; }
      .timeline li { display: grid; grid-template-columns: 7rem minmax(0, 1fr) auto; gap: 0.7rem; align-items: start; padding: 0.9rem; background: var(--panel); border: 1px solid var(--line); border-inline-start: 0.35rem solid var(--green); }
      .timeline time { color: var(--orange); font: 0.85rem/1.5 ui-monospace, monospace; }
      .timeline h2 { margin: 0; font-size: 1.1rem; }
      .timeline p { margin-block: 0.3rem 0; }
      .status { padding: 0.2rem 0.45rem; border: 1px solid currentColor; color: var(--green); font: 0.78rem/1.4 system-ui, sans-serif; font-weight: 850; }
      .issue { border-inline-start-color: var(--red); }
      .issue .status { color: var(--red); }
      .budget { margin-block-start: 0.8rem; padding: 0.8rem; color: #603b08; background: #fff5df; border-inline-start: 0.3rem solid var(--orange); }
      code { overflow-wrap: anywhere; }
      @media (max-width: 42rem) { .timeline li { grid-template-columns: minmax(0, 1fr) auto; } .timeline time { grid-column: 1 / -1; } }
      @media (max-width: 27rem) { .timeline li { grid-template-columns: 1fr; } .status { justify-self: start; } }
    `,
        body: `    <main>
      <p>版本 2026.11.24.7 · 价格页</p><h1>从 4.2 秒 LCP 到可放量</h1>
      <ol class="timeline">
        <li><time>11-24 09:10</time><div><h2>建立基线</h2><p>移动端 P75：LCP 2.4s、CLS 0.08、INP 180ms。</p></div><span class="status">通过</span></li>
        <li class="issue"><time>11-24 13:40</time><div><h2>发现主图回归</h2><p>LCP 升到 4.2s，资源证据显示主图未预留高度且优先级低。</p></div><span class="status">阻断</span></li>
        <li><time>11-24 16:20</time><div><h2>修复并复测</h2><p>补 width/height 和 fetchpriority；LCP 降至 2.3s，CLS 0.05。</p></div><span class="status">通过</span></li>
        <li><time>11-24 18:00</time><div><h2>小流量放量</h2><p>连续两个窗口低于门槛，INP 仍观察筛选操作。</p></div><span class="status">放量</span></li>
      </ol>
      <p class="budget"><code>block rollout when LCP P75 > 2500ms or CLS P75 > 0.10 for two windows</code></p>
    </main>`,
      }),
      '时间线包含基线、回归、修复和放量四阶段；阻断状态与通过状态有不同文字和边条；390px 时间换行、320px 每项单列；预算规则完整可读且页面无横向溢出。',
    ),
  ),

  'programming:HTML5 · 页面性能与企业站点交付：企业官网毕业项目与运行手册': browserLab(
    '企业官网交付基线',
    '把首页、服务、案例、联系、性能预算、无障碍和回滚证据收束成一个可运行手册。',
    browserTask(
      'html-css-final-graduation-web-practice',
      '企业官网首页',
      '交付带语义地标、首屏信息、服务卡、案例指标和联系入口的响应式首页。',
      htmlPage({
        key: 'graduation-web-practice',
        title: '远岬工程官网',
        style: `
      :root { --ink: #17272b; --paper: #eff4f1; --panel: #fffdf8; --green: #1f604b; --orange: #a45420; --blue: #25657d; --line: #a7b6ae; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      .skip { position: absolute; inset-block-start: .5rem; inset-inline-start: .5rem; z-index: 4; padding: .7rem; color: white; background: var(--green); transform: translateY(-180%); }
      .skip:focus { transform: translateY(0); }
      .top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .6rem 1rem; padding: .9rem clamp(.8rem,5vw,4rem); color: white; background: var(--green); }
      .top nav ul { display: flex; flex-wrap: wrap; gap: .4rem 1rem; margin: 0; padding: 0; list-style: none; }
      .top a { color: white; }
      main { width: min(72rem, 100%); margin-inline: auto; padding: clamp(.8rem,4vw,3rem); }
      .hero { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(16rem,.8fr); gap: .8rem; align-items: start; }
      h1 { max-inline-size: 15ch; color: var(--green); font-size: clamp(2.2rem,8vw,5rem); line-height: .98; }
      .hero-card, .service, .case { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      .hero-card { border-inline-start: .35rem solid var(--orange); }
      .services { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .7rem; margin-block-start: .8rem; }
      .service { border-top: .3rem solid var(--blue); }
      .case { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .7rem; margin-block-start: .8rem; }
      .case strong { display: block; color: var(--green); font-size: clamp(1.7rem,5vw,2.6rem); line-height: 1; }
      .contact { margin-block-start: .8rem; padding: 1rem; color: white; background: #294b3e; }
      .contact a { display: inline-flex; min-block-size: 2.75rem; align-items: center; color: #ffe1a3; font-weight: 800; }
      :focus-visible { outline: .25rem solid #f3b653; outline-offset: .18rem; }
      @media (max-width: 48rem) { .hero, .services { grid-template-columns: 1fr; } .case { grid-template-columns: 1fr; } }
      @media (max-width: 28rem) { .top nav ul { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); } }
    `,
        body: `    <a class="skip" href="#main">跳到主要内容</a>
    <header class="top"><a href="#home"><strong>远岬工程</strong></a><nav aria-label="主导航"><ul><li><a href="#services">服务</a></li><li><a href="#cases">案例</a></li><li><a href="#contact">联系</a></li></ul></nav></header>
    <main id="main">
      <div class="hero" id="home"><section><p>工业设施 · 能源与可靠性</p><h1>让每项改造都有运行证据</h1><p>从现场诊断、方案设计到上线复盘，团队把风险和停止条件写在每一步里。</p></section><aside class="hero-card"><h2>本周可预约</h2><p>设备能耗诊断 · 3 个现场名额</p><p><a href="#contact">提交诊断需求</a></p></aside></div>
      <section class="services" id="services"><h2>核心服务</h2><article class="service"><h3>设施诊断</h3><p>采集运行数据，定位能耗、可靠性和维护窗口问题。</p></article><article class="service"><h3>改造实施</h3><p>用灰度、回滚和验收指标控制现场变更。</p></article><article class="service"><h3>运行复盘</h3><p>把告警、责任人和下一次动作纳入月度记录。</p></article></section>
      <section class="case" id="cases" aria-label="案例结果"><article><strong>−22%</strong><span>平均等待时间</span></article><article><strong>99.95%</strong><span>核心服务可用性</span></article><article><strong>14 天</strong><span>上线观察窗口</span></article></section>
      <section class="contact" id="contact"><h2>从一次具体问题开始</h2><p>提供设备、现场窗口和当前指标，方案组会在两个工作日内回复。</p><a href="#contact">联系方案工程师</a></section>
    </main>`,
      }),
      '首页有跳转链接、唯一 main、站点导航和三块服务；标题层级清楚；390px 与 320px 所有网格单列；联系链接可达且在页面内换行，无横向滚动。',
    ),
    browserTask(
      'html-css-final-graduation-web-apply',
      '企业官网上线运行手册',
      '展示发布前检查、关键页面、性能预算、回滚顺序与交接记录，形成完整上线门槛。',
      htmlPage({
        key: 'graduation-web-apply',
        title: '企业官网上线手册',
        style: `
      :root { --ink: #24221d; --paper: #f3eee5; --panel: #fffdf8; --brown: #5b4230; --orange: #a45120; --green: #28644b; --red: #913934; --line: #b4a594; }
      body { color: var(--ink); background: var(--paper); font: 1rem/1.65 system-ui, sans-serif; }
      main { width: min(70rem, 100%); margin-inline: auto; padding: clamp(.8rem,4vw,3rem); }
      h1 { color: var(--brown); font-size: clamp(2rem,7vw,4.2rem); line-height: 1.04; }
      .grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .8rem; }
      section { min-inline-size: 0; padding: 1rem; background: var(--panel); border: 1px solid var(--line); }
      section h2 { color: var(--green); }
      ul { padding-inline-start: 1.2rem; }
      .budgets { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .5rem; }
      .budgets div { padding: .7rem; background: #e9f0ea; border: 1px solid #b5c1b7; }
      .budgets strong { display: block; color: var(--brown); font-size: 1.35rem; }
      .pages { display: flex; flex-wrap: wrap; gap: .45rem; }
      .pages span { padding: .25rem .5rem; border: 1px solid #87988c; }
      .rollback { border-inline-start: .35rem solid var(--red); }
      code { overflow-wrap: anywhere; }
      .handover { margin-block-start: .8rem; padding: .8rem; color: #603b08; background: #fff5df; border-inline-start: .3rem solid var(--orange); }
      @media (max-width: 44rem) { .grid { grid-template-columns: 1fr; } }
      @media (max-width: 28rem) { .budgets { grid-template-columns: 1fr; } }
    `,
        body: `    <main>
      <p>远岬工程官网 · release 2026.11.24.7</p><h1>上线运行手册</h1>
      <div class="grid">
        <section><h2>发布前检查</h2><ul><li>入口 HTML 的 title、description、canonical 完整。</li><li>首页、服务、案例、联系四条路径可访问。</li><li>键盘与 200% 缩放通过。</li><li>关键图片 width/height 与替代文本完整。</li></ul></section>
        <section><h2>性能预算</h2><div class="budgets"><div><strong>24 KB</strong><span>入口 HTML</span></div><div><strong>70 KB</strong><span>首屏 CSS</span></div><div><strong>220 KB</strong><span>首屏图片</span></div></div><p>移动端 LCP P75 ≤ 2.5s，CLS P75 ≤ 0.1，INP P75 ≤ 200ms。</p></section>
        <section><h2>冒烟页面</h2><div class="pages"><span>首页</span><span>服务</span><span>案例</span><span>联系</span></div><p>每个页面检查状态、主标题、唯一 main、主图替代文本和关键链接。</p></section>
        <section class="rollback"><h2>回滚顺序</h2><p><code>restore previous-manifest.4d22f1.json</code></p><ol><li>恢复入口 HTML。</li><li>清理 index.html 缓存。</li><li>复测四个冒烟页面。</li><li>记录指标与事件编号。</li></ol></section>
      </div>
      <p class="handover"><strong>交接：</strong>负责人 web-platform；构建可从空环境重放；回滚目标与验收记录保留 90 天。</p>
    </main>`,
      }),
      '手册覆盖发布前检查、三项预算、四条冒烟页面、四步回滚和交接字段；390px 与 320px 两栏变单列、预算变单列；所有记录可读且页面无横向溢出。',
    ),
  ),
};
